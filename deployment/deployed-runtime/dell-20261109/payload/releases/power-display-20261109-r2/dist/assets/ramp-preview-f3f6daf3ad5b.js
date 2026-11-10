// Display-only preview: no fetch, device calls, app toggles, or executable ramp actions.
(() => {
 if (!/\/desktop\/solar-star-4\//.test(location.pathname) && location.pathname !== '/') return;
 const attach = () => {
  if(document.querySelector('[data-ss4-ramp-preview]'))return;
  const heading=[...document.querySelectorAll('body *')].find(e=>e.children.length===0&&e.textContent.trim()==='EMS APPS');
  if(!heading || !document.body.textContent.includes('BHE0021'))return;
  const host=document.createElement('span');host.dataset.ss4RampPreview='true';heading.after(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
  :host{display:inline-block;margin:8px;font:13px system-ui;color:#17263c}button{font:inherit;cursor:pointer;border:1px solid #44688b;border-radius:6px;padding:9px 14px;background:#f2f7fc;color:#163e65}button:disabled{cursor:not-allowed;opacity:.5}dialog{border:1px solid #bdd0df;border-radius:12px;max-width:560px;width:calc(100vw - 60px);padding:24px;color:#17263c;background:white;box-shadow:0 20px 80px #0005}dialog::backdrop{background:#10223888}h2{margin:0 0 6px;font-size:20px}p{line-height:1.5}label{display:block;margin:16px 0}input{padding:9px;border:1px solid #9db3c6;border-radius:5px;font:inherit;width:140px;margin-left:8px}.notice{padding:12px;background:#fff3d4;border:1px solid #e3c36a;border-radius:6px}.sequence{background:#f1f5fa;padding:12px;border-radius:6px;line-height:1.6}.footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.small{font-size:12px;color:#4a6178}
  </style><button id="open" type="button">Ramp site power · Preview</button><dialog aria-labelledby="title"><h2 id="title">Ramp site power</h2><div class="small">Solar Star 4 · BHE0021 / Block 1</div><p class="notice"><strong>Live ramp execution disabled</strong><br>Interface preview only. No power commands or EMS app changes can be issued from this panel.</p><label>Target real power (kW)<input type="number" id="target" value="0" min="-23000" max="23000" step="100"></label><p class="small">Positive discharges · Negative charges<br>Configured ramp: 9,200 kW/min · Range: −23,000 to +23,000 kW</p><div class="sequence">Match current SunSpec P/Q in Power Control and enable manual control → disable and verify SunSpec → ramp toward target.</div><p id="outcome">At zero: verify settled power, disable Power Control, leave both command apps disabled.</p><p class="small">Nonzero targets hold Power Control enabled at the selected target. Site limits and feedback require commissioning before execution.</p><div class="footer"><button disabled type="button">Start ramp — disabled</button><button disabled type="button">Stop further steps</button><button id="close" type="button">Close preview</button></div></dialog>`;
  const dialog=root.querySelector('dialog');
  root.querySelector('#open').onclick=()=>dialog.showModal();
  root.querySelector('#close').onclick=()=>dialog.close();
  root.querySelector('#target').oninput=e=>{root.querySelector('#outcome').textContent=Number(e.target.value)===0?'At zero: verify settled power, disable Power Control, leave both command apps disabled.':'At a nonzero target: leave SunSpec disabled and Power Control enabled, holding the target until manually adjusted.';};
 };
 attach();new MutationObserver(attach).observe(document.body,{childList:true,subtree:true});
})();
