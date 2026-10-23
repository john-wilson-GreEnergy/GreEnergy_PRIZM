import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

// Node exposes POSIX modes but not Windows DACLs. Use the OS security API via
// built-in PowerShell on Windows, never a downloaded tool or shell interpolation.
function windowsAcl(file:string,create:boolean){
  const script=`$ErrorActionPreference='Stop';
    $p=$env:PRIZM_SMA_ACL_PATH;
    $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;
    $allowed=@($sid.Value,'S-1-5-18','S-1-5-32-544');
    ${create?`$acl=New-Object System.Security.AccessControl.DirectorySecurity;
    $acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);
    foreach($id in $allowed){$identity=New-Object System.Security.Principal.SecurityIdentifier($id);
      $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);}
    Set-Acl -LiteralPath $p -AclObject $acl;`:''}
    $actual=Get-Acl -LiteralPath $p;
    foreach($rule in $actual.Access){if($rule.AccessControlType -eq 'Allow'){
      $id=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;
      if($allowed -notcontains $id){throw 'Access is not private';}}}
    if($allowed -notcontains $actual.GetOwner([System.Security.Principal.SecurityIdentifier]).Value){throw 'Untrusted owner';}`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,PRIZM_SMA_ACL_PATH:file},stdio:'pipe',timeout:10_000});
}
export function verifyPrivateFile(file:string,max:number):Buffer{
  const stat=fs.lstatSync(file);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>max)throw Error('Invalid SMA private file');
  if(process.platform==='win32')windowsAcl(file,false);
  else if((stat.mode&0o077)!==0)throw Error('SMA vault permissions are not private');
  return fs.readFileSync(file);
}
export function createPrivateDirectory(directory:string){
  fs.mkdirSync(directory,{mode:0o700});
  // Apply the DACL before writing any credential or encryption key.
  if(process.platform==='win32')windowsAcl(directory,true);
}
