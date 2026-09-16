import {historyFiltersFromQuery} from "./historyReview";
import type {ThermalMetric} from "./thermalMetrics";
import { Router } from "express";
import { thermalService } from "./thermalService";
export const thermalRouter=Router();
thermalRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");if(process.env.PRIZM_THERMAL_ENABLED==="false")return res.status(503).json({error:"Thermal workspace disabled"});next();});
thermalRouter.get("/",async(_req,res)=>{try{res.json(await thermalService().view());}catch(e){res.status(500).json({error:String(e)});}});
thermalRouter.get("/history",async(req,res)=>{try{
  const ids=String(req.query.ids??"").split(",").filter(Boolean);
  const points=await thermalService().displayPoints(ids,Number(req.query.from??0),req.query.session?String(req.query.session):undefined,String(req.query.metric??"space") as ThermalMetric,{...historyFiltersFromQuery(req.query),to:req.query.to===undefined?undefined:Number(req.query.to)});
  res.json({points});
}catch(e){res.status(400).json({error:String(e)});}});
thermalRouter.post("/recordings",async(req,res)=>{try{
  if(!Array.isArray(req.body.targets)||req.body.targets.some((id:unknown)=>typeof id!=="string"))throw new Error("Invalid targets");
  res.json(await thermalService().start(req.body.targets,Number(req.body.hours)));
}catch(e){res.status(400).json({error:String(e)});}});
thermalRouter.post("/recordings/:id/stop",async(req,res)=>{try{res.json(await thermalService().stop(String(req.params.id)));}catch(e){res.status(400).json({error:String(e)});}});

thermalRouter.get("/storage",async(_req,res)=>{try{res.json(await thermalService().siteHistory.status());}catch(e){res.status(500).json({error:String(e)});}});
thermalRouter.post("/storage",async(req,res)=>{try{res.json(await thermalService().siteHistory.configure({enabled:req.body.enabled,retentionDays:req.body.retentionDays,maxGiB:req.body.maxGiB}));}catch(e){res.status(400).json({error:String(e)});}});
thermalRouter.get("/site-history",async(req,res)=>{try{res.json(await thermalService().siteHistory.query(String(req.query.ids??"").split(",").filter(Boolean),Number(req.query.from),Number(req.query.to??Date.now()),String(req.query.metric??"space") as ThermalMetric,historyFiltersFromQuery(req.query)));}catch(e){res.status(400).json({error:String(e)});}});

thermalRouter.get("/history-devices",async(_req,res)=>{try{res.json({devices:await thermalService().siteHistory.historyDevices()});}catch(e){res.status(400).json({error:String(e)});}});

// Read-only POST avoids URL/header limits for whole-site device selections.
thermalRouter.post("/site-history/query",async(req,res)=>{try{
  if(!Array.isArray(req.body.ids)||req.body.ids.some((id:unknown)=>typeof id!=="string"))throw new Error("Invalid history devices");
  res.json(await thermalService().siteHistory.query(req.body.ids,Number(req.body.from),Number(req.body.to??Date.now()),String(req.body.metric??"space") as ThermalMetric,historyFiltersFromQuery(req.body)));
}catch(e){res.status(400).json({error:String(e)});}});
