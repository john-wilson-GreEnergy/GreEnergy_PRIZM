import {formatJsonExport} from "./jsonExportFormat";
self.onmessage=(event:MessageEvent<unknown>)=>{
  try{self.postMessage({blob:new Blob([formatJsonExport(event.data)],{type:"application/json"})});}
  catch(error){self.postMessage({error:String(error)});}
};
