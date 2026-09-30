/** Offline source inventory. Never imports or executes application modules. */
import ts from 'typescript';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);
interface Location { file: string; line: number }
interface Registration extends Location {
  method: string;
  paths: string[] | null;
  handlers: ts.Expression[];
  node: ts.CallExpression;
  context: string[];
}
interface Router {
  symbol: ts.Symbol;
  name: string;
  location: Location;
  registrations: Registration[];
  application: boolean;
}
export interface InventoryRoute extends Location {
  method: string;
  path: string;
  handlers: string[];
  registrationHash: string;
  review: 'required';
  registrationContext: string[];
}
export interface Inventory {
  schemaVersion: 1;
  entry: string;
  routes: InventoryRoute[];
  middleware: (Location & { path: string; handlers: string[] })[];
  findings: (Location & { message: string })[];
  unmountedRouters: (Location & { name: string })[];
}

export function inventoryApi(entryFile: string): Inventory {
  const entry = path.resolve(entryFile);
  const root = path.dirname(entry);
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const sources = program.getSourceFiles().filter(file => !file.isDeclarationFile && !file.fileName.includes('/node_modules/'));
  const result: Inventory = { schemaVersion: 1, entry: path.basename(entry), routes: [], middleware: [], findings: [], unmountedRouters: [] };
  const routers = new Map<ts.Symbol, Router>();
  const location = (node: ts.Node): Location => ({
    file: path.relative(root, node.getSourceFile().fileName),
    line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
  });
  const finding = (node: ts.Node, message: string) => result.findings.push({ ...location(node), message });
  const contextFor = (node: ts.Node): string[] => {
    const context: string[] = [];
    for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
      if (ts.isIfStatement(parent)) context.unshift(`${child === parent.elseStatement ? 'else of ' : 'if '}${parent.expression.getText()}`);
      if (ts.isForOfStatement(parent) || ts.isForInStatement(parent) || ts.isForStatement(parent) || ts.isWhileStatement(parent)) context.unshift(`loop at ${location(parent).file}:${location(parent).line}`);
      if (ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) context.unshift(`function at ${location(parent).file}:${location(parent).line}`);
    }
    return context;
  };
  const symbolFor = (node: ts.Node): ts.Symbol | undefined => {
    let symbol = checker.getSymbolAtLocation(node);
    const seen = new Set<ts.Symbol>();
    while (symbol && !seen.has(symbol)) {
      seen.add(symbol);
      if (symbol.flags & ts.SymbolFlags.Alias) { symbol = checker.getAliasedSymbol(symbol); continue; }
      const declaration = symbol.valueDeclaration;
      if (declaration && ts.isExportAssignment(declaration) && ts.isIdentifier(declaration.expression)) {
        symbol = checker.getSymbolAtLocation(declaration.expression); continue;
      }
      if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isIdentifier(declaration.initializer)) {
        symbol = checker.getSymbolAtLocation(declaration.initializer); continue;
      }
      break;
    }
    return symbol;
  };
  const visit = (node: ts.Node, fn: (node: ts.Node) => void) => {
    fn(node);
    ts.forEachChild(node, child => visit(child, fn));
  };
  // Recognize constructors by Express import, not by arbitrary variables named "router".
  const expressConstructor = (expression: ts.Expression): 'app' | 'router' | null => {
    let target: ts.Node = expression;
    let member = '';
    if (ts.isPropertyAccessExpression(expression)) { target = expression.expression; member = expression.name.text; }
    const symbol = checker.getSymbolAtLocation(target);
    for (const declaration of symbol?.declarations ?? []) {
      let ancestor: ts.Node | undefined = declaration;
      while (ancestor && !ts.isImportDeclaration(ancestor)) ancestor = ancestor.parent;
      if (!ancestor || !ts.isImportDeclaration(ancestor) || !ts.isStringLiteral(ancestor.moduleSpecifier) || ancestor.moduleSpecifier.text !== 'express') continue;
      if (ts.isImportSpecifier(declaration) && (declaration.propertyName ?? declaration.name).text === 'Router') return 'router';
      if (member === 'Router') return 'router';
      if (!member && ts.isImportClause(declaration)) return 'app';
    }
    return null;
  };
  for (const file of sources) visit(file, node => {
    if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isCallExpression(node.initializer)) return;
    const kind = expressConstructor(node.initializer.expression);
    const symbol = symbolFor(node.name);
    if (kind && symbol) routers.set(symbol, { symbol, name: node.name.getText(), location: location(node), registrations: [], application: kind === 'app' });
  });
  const literalPaths = (expression: ts.Expression | undefined): string[] | null => {
    if (!expression) return null;
    if (ts.isStringLiteralLike(expression)) return [expression.text];
    if (ts.isArrayLiteralExpression(expression)) {
      const parts = expression.elements.map(element => literalPaths(element));
      return parts.every(part => part !== null) ? parts.flat() as string[] : null;
    }
    return null;
  };
  const receiver = (expression: ts.Expression): { router: Router; routePaths?: string[] | null } | null => {
    const symbol = symbolFor(expression);
    if (symbol && routers.has(symbol)) return { router: routers.get(symbol)! };
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
      const name = expression.expression.name.text;
      const parent = receiver(expression.expression.expression);
      if (parent && name === 'route') return { ...parent, routePaths: literalPaths(expression.arguments[0]) };
      if (parent && (methods.has(name) || name === 'use')) return parent;
    }
    return null;
  };
  for (const file of sources) {
    for (const diagnostic of program.getSyntacticDiagnostics(file)) {
      result.findings.push({ file: path.relative(root, file.fileName), line: file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ') });
    }
    visit(file, node => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
      const method = node.expression.name.text;
      if (!methods.has(method) && method !== 'use') return;
      const owner = receiver(node.expression.expression);
      if (!owner) return;
      if (method === 'get' && node.arguments.length === 1 && owner.routePaths === undefined) return; // app setting getter
      let paths = owner.routePaths === undefined ? literalPaths(node.arguments[0]) : owner.routePaths;
      let handlers = [...node.arguments].slice(owner.routePaths === undefined ? 1 : 0);
      const first = node.arguments[0];
      const firstSymbol = first && symbolFor(first);
      const ambiguousMount = first && node.arguments.length > 1 &&
        (ts.isIdentifier(first) || ts.isPropertyAccessExpression(first)) &&
        !(firstSymbol && routers.has(firstSymbol)) && !checker.getTypeAtLocation(first).getCallSignatures().length;
      if (method === 'use' && paths === null && first && !ambiguousMount &&
          !(checker.getTypeAtLocation(first).flags & ts.TypeFlags.StringLike) &&
          (ts.isIdentifier(first) || ts.isArrowFunction(first) || ts.isFunctionExpression(first) || ts.isCallExpression(first) || ts.isPropertyAccessExpression(first))) {
        paths = ['/']; handlers = [...node.arguments];
      }
      owner.router.registrations.push({ ...location(node), method, paths, handlers, node, context: contextFor(node) });
    });
  }
  const describe = (handler: ts.Expression): string => ts.isArrowFunction(handler) || ts.isFunctionExpression(handler) ? '(inline)' : handler.getText();
  const join = (prefix: string, suffix: string) => `${prefix.replace(/\/$/, '')}/${suffix.replace(/^\//, '')}`.replace(/\/$/, '') || '/';
  const mounted = new Set<Router>();
  const expand = (router: Router, prefix: string, stack: Set<Router>, context: string[] = []) => {
    if (stack.has(router)) { result.findings.push({ ...router.location, message: `Router mount cycle at ${prefix}` }); return; }
    mounted.add(router);
    const next = new Set([...stack, router]);
    for (const registration of router.registrations) {
      const { paths, handlers, method, node, file, line } = registration;
      const registrationContext = [...context, ...registration.context];
      if (!paths) { finding(node, `Unresolved ${method.toUpperCase()} path; review manually`); continue; }
      for (const suffix of paths) {
        const fullPath = join(prefix, suffix);
        if (method !== 'use') {
          result.routes.push({ file, line, method: method.toUpperCase(), path: fullPath, handlers: handlers.map(describe), registrationHash: createHash('sha256').update(node.getText()).digest('hex'), review: 'required', registrationContext });
          continue;
        }
        for (const handler of handlers) {
          const symbol = symbolFor(handler);
          const child = symbol && routers.get(symbol);
          if (child) expand(child, fullPath, next, registrationContext);
          else result.middleware.push({ file, line, path: fullPath, handlers: [describe(handler)] });
        }
      }
    }
  };
  const apps = [...routers.values()].filter(router => router.application && path.resolve(root, router.location.file) === entry);
  if (!apps.length) result.findings.push({ file: path.basename(entry), line: 1, message: 'No Express application constructor found in entry file' });
  for (const app of apps) expand(app, '', new Set());
  for (const router of routers.values()) if (!mounted.has(router)) result.unmountedRouters.push({ ...router.location, name: router.name });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = inventoryApi(process.argv[2] ?? 'server.ts');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.findings.length) process.exitCode = 1;
}
