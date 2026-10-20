import {Router} from 'express';
import type {CellHistory} from './CellHistory';
import type {CellMetric} from '../../core/cellHistory';

function metric(v: unknown): CellMetric {
  if (v === 'temperatureF' || v === 'millivolts') return v;
  throw new Error('Invalid cell metric');
}
function array(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 64) throw new Error('Invalid array'); return n;
}
export function createCellHistoryRouter(cellHistory: CellHistory) {
const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/', (req, res) => {
  try { res.json(cellHistory.view(metric(req.query.metric ?? 'millivolts'), Date.now(), array(req.query.array))); }
  catch (error) { res.status(400).json({error: error instanceof Error ? error.message : 'Cell view unavailable'}); }
});
router.get('/history', async (req, res) => {
  const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    res.json(await cellHistory.query({from: Number(req.query.from), to: Number(req.query.to), metric: metric(req.query.metric),
      ids: String(req.query.ids ?? '').split(',').filter(Boolean), array: array(req.query.array)}, controller.signal));
  } catch (error) { if (!res.destroyed) res.status(400).json({error: error instanceof Error ? error.message : 'Cell history unavailable'}); }
});
router.get('/index', async (req,res)=>{
  try {
    if(Object.keys(req.query).some(key=>!['from','to','after','limit'].includes(key))||Object.values(req.query).some(v=>typeof v!=='string'||!/^\d+$/.test(v)))throw new Error('Invalid snapshot index query');
    const input=Object.fromEntries(Object.entries(req.query).map(([k,v])=>[k,Number(v)]));
    res.json(await cellHistory.index(input));
  }catch(error){res.status(400).json({error:error instanceof Error?error.message:'Snapshot list unavailable'});}
});
router.get('/snapshot', async (req, res) => {
  const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const selectedArray = array(req.query.array);
    if (selectedArray === undefined) throw new Error('Select an array');
    res.json(await cellHistory.snapshot({array: selectedArray, metric: metric(req.query.metric ?? 'millivolts'),
      at: req.query.at === undefined ? undefined : Number(req.query.at)}, controller.signal));
  } catch (error) { if (!res.destroyed) res.status(400).json({error: error instanceof Error ? error.message : 'Cell snapshot unavailable'}); }
});
return router;
}
