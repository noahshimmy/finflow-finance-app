import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as pdfjsLib from "pdfjs-dist";
import { Upload, FileText, Plus, Trash2, Pencil, Check, X, ArrowLeft, ArrowRight,
  LayoutDashboard, List, PieChart, Download, Search, Tag, RotateCcw, FileUp,
  Wallet, CircleHelp, ChevronDown } from "lucide-react";
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import "./style.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url
).toString();

const PALETTE = ["#10b981","#3b82f6","#8b5cf6","#f59e0b","#f43f5e","#06b6d4","#ec4899","#6366f1","#84cc16","#f97316"];
const DEFAULT_CATEGORIES = [
  {id:"food",name:"Groceries & Food",color:0},{id:"transport",name:"Transport & Fuel",color:1},
  {id:"bills",name:"Bills & Utilities",color:2},{id:"leisure",name:"Dining & Leisure",color:3},
  {id:"shopping",name:"Shopping & Tech",color:4},{id:"health",name:"Health & Wellness",color:5}
];
const SAMPLE = [
  ["2026-11-01","Shoprite Supermarket Wuse",48500,"Monthly groceries"],
  ["2026-11-02","TotalEnergies Service Station",32000,"Fuel"],
  ["2026-11-02","MTN Fiber Broadband",25000,"Internet subscription"],
  ["2026-11-03","Nkoyo Restaurant",18500,"Dinner"],
  ["2026-11-04","AEDC Electricity Token",40000,"Electricity"],
  ["2026-11-05","Bolt Ride Trip",4200,"Transport"],
].map((r,i)=>({id:`sample-${i}`,date:r[0],description:r[1],amount:r[2],notes:r[3],categoryId:null}));

function readStore(key, fallback) {
  try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function money(v,currency) { return `${currency}${(Number(v)||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function parseAmount(v) {
  if (typeof v === "number") return Math.abs(v);
  const s = String(v ?? "").trim();
  const n = Number(s.replace(/[^\d.-]/g,""));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}
function splitCsvLine(line, delimiter) {
  const out=[]; let cur="", quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch === '"'){ if(quoted && line[i+1] === '"'){cur+='"';i++;} else quoted=!quoted; }
    else if(ch===delimiter && !quoted){out.push(cur.trim());cur="";}
    else cur+=ch;
  }
  out.push(cur.trim()); return out;
}
function parseDelimited(text) {
  const lines=text.split(/\r?\n/).filter(x=>x.trim());
  if(!lines.length) return {headers:[],rows:[]};
  const first=lines[0], delimiter=first.includes("\t")?"\t":(first.split(";").length>first.split(",").length?";":",");
  const all=lines.map(l=>splitCsvLine(l,delimiter));
  const headerLike=all[0].some(x=>/date|description|merchant|narration|amount|debit|credit|note|reference/i.test(x));
  return {headers:headerLike?all[0]:all[0].map((_,i)=>`Column ${i+1}`),rows:headerLike?all.slice(1):all};
}
function detectColumns(headers) {
  const m={date:0,description:1,amount:2,notes:-1};
  headers.forEach((h,i)=>{
    const s=h.toLowerCase();
    if(/date|transaction time|posting date/.test(s))m.date=i;
    else if(/description|merchant|narration|particular|payee|details/.test(s))m.description=i;
    else if(/amount|debit|withdrawal|paid out|value|transaction amount/.test(s))m.amount=i;
    else if(/note|reference|memo|remark/.test(s))m.notes=i;
  });
  return m;
}
function inferPdfRows(text) {
  // PDF text extraction preserves text, not necessarily table columns. This is a conservative row heuristic.
  return text.split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(x=>x && /(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/.test(x) && /[\d,]+\.\d{2}/.test(x));
}
function downloadCsv(items) {
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines=[["Date","Description","Amount","Notes","Category"].map(esc).join(","),
    ...items.map(t=>[t.date,t.description,t.amount,t.notes,t.categoryName||""].map(esc).join(","))];
  const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download="finflow-transactions.csv";a.click();URL.revokeObjectURL(url);
}

function App(){
  const [transactions,setTransactions]=useState(()=>readStore("finflow_transactions",SAMPLE));
  const [categories,setCategories]=useState(()=>readStore("finflow_categories",DEFAULT_CATEGORIES));
  const [currency,setCurrency]=useState(()=>readStore("finflow_currency","₦"));
  const [tab,setTab]=useState("review");
  const [focus,setFocus]=useState(0);
  const [bulk,setBulk]=useState(false);
  const [undo,setUndo]=useState(null);
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [newCategory,setNewCategory]=useState("");
  const [newColor,setNewColor]=useState(0);
  const [raw,setRaw]=useState("");
  const [preview,setPreview]=useState(null);
  const [mapping,setMapping]=useState({date:0,description:1,amount:2,notes:-1});
  const [importMode,setImportMode]=useState("append");
  const [fileName,setFileName]=useState("");
  const [pdfWarnings,setPdfWarnings]=useState("");
  const [toast,setToast]=useState("");
  const fileRef=useRef(null);

  useEffect(()=>localStorage.setItem("finflow_transactions",JSON.stringify(transactions)),[transactions]);
  useEffect(()=>localStorage.setItem("finflow_categories",JSON.stringify(categories)),[categories]);
  useEffect(()=>localStorage.setItem("finflow_currency",JSON.stringify(currency)),[currency]);
  const uncategorized=useMemo(()=>transactions.filter(t=>!t.categoryId),[transactions]);
  const current=uncategorized[Math.min(focus,Math.max(0,uncategorized.length-1))]||null;
  const total=transactions.reduce((s,t)=>s+(Number(t.amount)||0),0);
  const categorized=transactions.filter(t=>t.categoryId);
  const progress=transactions.length?Math.round(categorized.length/transactions.length*100):0;
  const notify=(s)=>{setToast(s);setTimeout(()=>setToast(""),2800);};

  function assign(tx,catId,applySimilar=false){
    const target=transactions.find(t=>t.id===tx);if(!target)return;
    const ids=transactions.filter(t=>t.id===tx || (applySimilar&&!t.categoryId&&t.description.trim().toLowerCase()===target.description.trim().toLowerCase())).map(t=>t.id);
    const previous=Object.fromEntries(transactions.filter(t=>ids.includes(t.id)).map(t=>[t.id,t.categoryId]));
    setTransactions(prev=>prev.map(t=>ids.includes(t.id)?{...t,categoryId:catId}:t));
    setUndo({ids,previous,description:target.description});
    notify(ids.length>1?`${ids.length} matching transactions categorized`:"Transaction categorized");
    setFocus(0);
  }
  function undoLast(){
    if(!undo)return;
    setTransactions(prev=>prev.map(t=>undo.ids.includes(t.id)?{...t,categoryId:undo.previous[t.id]??null}:t));
    notify("Last categorization undone");setUndo(null);
  }
  function addCategory(e){
    e.preventDefault();const name=newCategory.trim();if(!name)return;
    if(categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){notify("That category already exists");return;}
    setCategories(p=>[...p,{id:`cat-${Date.now()}`,name,color:newColor}]);setNewCategory("");setNewColor((newColor+1)%PALETTE.length);notify("Category created");
  }
  function parseText(value,name=""){
    setRaw(value);setFileName(name);setPdfWarnings("");
    const p=parseDelimited(value);if(p.rows.length){setPreview(p);setMapping(detectColumns(p.headers));}
    else setPreview(null);
  }
  async function handleFiles(files){
    const file=files?.[0];if(!file)return;
    setFileName(file.name);setPdfWarnings("");
    try{
      if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){
        const bytes=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
        let text="";
        for(let n=1;n<=pdf.numPages;n++){
          const page=await pdf.getPage(n);const content=await page.getTextContent();
          // Group text items into approximate visual lines using their Y coordinate.
          const groups=new Map();
          for(const item of content.items){
            if(!item.str?.trim())continue;
            const y=Math.round(item.transform?.[5]||0);
            if(!groups.has(y))groups.set(y,[]);
            groups.get(y).push({x:item.transform?.[4]||0,s:item.str});
          }
          text += [...groups.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.x-b.x).map(x=>x.s).join(" ")).join("\n")+"\n";
        }
        setRaw(text);
        const rows=inferPdfRows(text);
        if(rows.length){
          const headers=["Extracted statement row"];
          setPreview({headers,rows:rows.map(r=>[r])});
          setMapping({date:0,description:0,amount:0,notes:-1});
          setPdfWarnings(`Extracted text from ${pdf.numPages} page(s). PDF layouts vary, so inspect every preview row and adjust the mapping before importing.`);
        }else{
          setPreview(null);
          setPdfWarnings("No selectable transaction text was detected. This may be a scanned/image-only PDF or an unsupported statement layout. Use an OCR-readable PDF or export the statement as CSV.");
        }
      }else{
        const text=await file.text();parseText(text,file.name);
      }
    }catch(err){console.error(err);setPreview(null);setPdfWarnings("Could not read this file. Try a password-free PDF or CSV export.");}
  }
  function confirmImport(){
    if(!preview?.rows?.length)return;
    const mapped=preview.rows.map((row,i)=>{
      let date=String(row[mapping.date]??"").trim();
      let description=String(row[mapping.description]??"").trim();
      let amountRaw=row[mapping.amount]??"";
      let notes=mapping.notes>=0?String(row[mapping.notes]??"").trim():"";
      if(preview.headers.length===1){
        const line=String(row[0]||"");
        const dateMatch=line.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
        const amounts=[...line.matchAll(/(?:₦|NGN)?\s*\(?-?[\d,]+\.\d{2}\)?/g)].map(m=>m[0]);
        date=dateMatch?.[0]||"";
        amountRaw=amounts.at(-1)||"";
        description=line.replace(date,"").replace(amountRaw,"").replace(/\s+/g," ").trim();
        notes="";
      }
      const amount=parseAmount(amountRaw);
      if(!description||!amount)return null;
      const normalizedDate=date?new Date(date).toISOString().slice(0,10):new Date().toISOString().slice(0,10);
      return {id:`tx-${Date.now()}-${i}-${Math.random().toString(36).slice(2,7)}`,date:normalizedDate,description,amount,notes,categoryId:null};
    }).filter(Boolean);
    if(!mapped.length){notify("No usable transactions found. Check the column mapping.");return;}
    setTransactions(prev=>importMode==="replace"?mapped:[...prev,...mapped]);
    notify(`${mapped.length} transaction(s) imported`);
    setPreview(null);setRaw("");setFileName("");setPdfWarnings("");setTab("review");setFocus(0);
  }
  const filtered=transactions.filter(t=>{
    const q=query.toLowerCase();
    const matches=(t.description+" "+t.notes).toLowerCase().includes(q);
    const status=filter==="all"||(filter==="uncategorized"&&!t.categoryId)||(filter==="categorized"&&t.categoryId);
    return matches&&status;
  });
  const byCategory=categories.map(c=>({...c,value:transactions.filter(t=>t.categoryId===c.id).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.value>0);
  const chartData=byCategory.map(c=>({name:c.name,amount:c.value,color:PALETTE[c.color]}));
  const nav=[["review","Review",LayoutDashboard],["transactions","Transactions",List],["import","Import",FileUp],["summary","Summary",PieChart]];
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Wallet size={20}/></div><div><b>FinFlow</b><small>PERSONAL FINANCE WORKSPACE</small></div></div>
      <div className="top-actions"><label className="currency-label">Currency <select value={currency} onChange={e=>setCurrency(e.target.value)}><option value="₦">NGN ₦</option><option value="$">USD $</option><option value="£">GBP £</option><option value="€">EUR €</option></select></label><button className="button secondary" onClick={()=>downloadCsv(transactions.map(t=>({...t,categoryName:categories.find(c=>c.id===t.categoryId)?.name||"Uncategorized"})))}><Download size={16}/> Export CSV</button></div>
    </header>
    <main className="main">
      <section className="welcome"><div><div className="eyebrow">YOUR MONEY, MADE CLEAR</div><h1>Expense workspace</h1><p>Import statements, categorize spending, and see where your money goes.</p></div><div className="progress-card"><div className="progress-head"><span>Organizing transactions</span><b>{progress}%</b></div><div className="progress-track"><div style={{width:`${progress}%`}}/></div><small>{categorized.length} of {transactions.length} categorized</small></div></section>
      <section className="stats">
        <div className="stat"><span>Total transactions</span><strong>{transactions.length}</strong><small>Across all imported records</small></div>
        <div className="stat"><span>Total recorded spend</span><strong>{money(total,currency)}</strong><small>Based on imported amounts</small></div>
        <div className="stat"><span>Needs review</span><strong>{uncategorized.length}</strong><small>Uncategorized transactions</small></div>
      </section>
      <nav className="tabs">{nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={17}/>{label}{id==="review"&&uncategorized.length>0&&<i>{uncategorized.length}</i>}</button>)}</nav>

      {tab==="review"&&<section className="panel">
        <div className="panel-heading"><div><div className="eyebrow">QUICK CATEGORIZATION</div><h2>Review transactions</h2><p>Assign a category to each transaction that still needs review.</p></div>{undo&&<button className="button secondary" onClick={undoLast}><RotateCcw size={15}/> Undo</button>}</div>
        {!current?<div className="empty"><Check size={28}/><h3>All caught up</h3><p>Every transaction has a category. Import another statement to continue.</p><button className="button primary" onClick={()=>setTab("import")}>Import transactions</button></div>:<>
          <div className="review-count"><span>TRANSACTION {Math.min(focus+1,uncategorized.length)} OF {uncategorized.length}</span><span>{money(current.amount,currency)}</span></div>
          <div className="transaction-focus"><div className="tx-icon"><FileText size={24}/></div><div className="tx-main"><h3>{current.description}</h3><p>{current.date} {current.notes?`· ${current.notes}`:""}</p></div><strong>{money(current.amount,currency)}</strong></div>
          <label className="bulk-toggle"><input type="checkbox" checked={bulk} onChange={e=>setBulk(e.target.checked)}/> Apply this category to other uncategorized transactions with the exact same description</label>
          <div className="category-grid">{categories.map((c,i)=><button key={c.id} className="category-choice" onClick={()=>assign(current.id,c.id,bulk)}><span className="color-dot" style={{background:PALETTE[c.color]}}/><span>{c.name}</span><kbd>{i<9?i+1:""}</kbd></button>)}</div>
          <div className="review-footer"><button className="button secondary" disabled={focus===0} onClick={()=>setFocus(x=>Math.max(0,x-1))}><ArrowLeft size={16}/> Previous</button><button className="button secondary" onClick={()=>setFocus(x=>(x+1)%uncategorized.length)}>Skip <ArrowRight size={16}/></button></div>
        </>}
        <div className="category-create"><form onSubmit={addCategory}><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="Create a new category…"/><button className="button secondary" type="submit"><Plus size={16}/> Add category</button></form><div className="swatches">{PALETTE.map((c,i)=><button key={c} aria-label={`Choose color ${i+1}`} className={newColor===i?"selected":""} style={{background:c}} onClick={()=>setNewColor(i)}/>)}</div></div>
      </section>}

      {tab==="import"&&<section className="panel">
        <div className="panel-heading"><div><div className="eyebrow">ADD FINANCIAL DATA</div><h2>Import a statement</h2><p>Upload a bank statement PDF, CSV, or paste exported transaction data.</p></div><FileUp size={25} className="muted-icon"/></div>
        <div className="upload-zone" onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFiles(e.dataTransfer.files);}}>
          <input ref={fileRef} type="file" accept=".pdf,.csv,.txt,.tsv" hidden onChange={e=>handleFiles(e.target.files)}/>
          <div className="upload-icon"><Upload size={24}/></div><h3>Choose a file or drag it here</h3><p>PDF, CSV, TXT or TSV · PDF text extraction runs in your browser</p><button className="button primary" type="button">Browse files</button>
        </div>
        {fileName&&<div className="file-chip"><FileText size={16}/><span>{fileName}</span><button onClick={()=>{setFileName("");setPreview(null);setRaw("");setPdfWarnings("");}}><X size={15}/></button></div>}
        {pdfWarnings&&<div className="notice"><CircleHelp size={17}/><span>{pdfWarnings}</span></div>}
        <div className="paste-area"><label>Or paste CSV / delimited text</label><textarea rows="6" value={raw} onChange={e=>parseText(e.target.value)} placeholder={"Date,Description,Amount,Reference\\n2026-11-01,Example Store,12500,Groceries"}/></div>
        {preview&&<div className="preview">
          <div className="preview-head"><div><h3>Import preview</h3><p>{preview.rows.length} detected row(s). Confirm the column mapping before importing.</p></div><label className="mode-select">Import mode <select value={importMode} onChange={e=>setImportMode(e.target.value)}><option value="append">Add to existing data</option><option value="replace">Replace all existing data</option></select></label></div>
          {preview.headers.length>1&&<div className="mapping">{[["date","Date"],["description","Description"],["amount","Amount"],["notes","Notes (optional)"]].map(([key,label])=><label key={key}>{label}<select value={mapping[key]} onChange={e=>setMapping(m=>({...m,[key]:Number(e.target.value)}))}>{key==="notes"&&<option value={-1}>Not mapped</option>}{preview.headers.map((h,i)=><option value={i} key={i}>{h}</option>)}</select></label>)}</div>}
          <div className="table-wrap"><table><thead><tr>{preview.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{preview.rows.slice(0,8).map((r,i)=><tr key={i}>{preview.headers.map((_,j)=><td key={j}>{r[j]||"—"}</td>)}</tr>)}</tbody></table></div>
          <button className="button primary" onClick={confirmImport}>Import {preview.rows.length} rows <ArrowRight size={16}/></button>
        </div>}
        <div className="privacy-note"><Check size={16}/> Files are processed locally in this browser. FinFlow does not send statements to a server.</div>
      </section>}

      {tab==="transactions"&&<section className="panel">
        <div className="panel-heading"><div><div className="eyebrow">ALL RECORDS</div><h2>Transactions</h2><p>Search and review imported financial activity.</p></div></div>
        <div className="filters"><div className="searchbox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search merchant or notes"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All transactions</option><option value="uncategorized">Uncategorized</option><option value="categorized">Categorized</option></select></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="right">Amount</th><th></th></tr></thead><tbody>{filtered.map(t=>{const c=categories.find(x=>x.id===t.categoryId);return <tr key={t.id}><td>{t.date}</td><td><b>{t.description}</b><small className="cell-note">{t.notes}</small></td><td>{c?<span className="category-pill"><i style={{background:PALETTE[c.color]}}/>{c.name}</span>:<span className="uncat">Uncategorized</span>}</td><td className="right amount">{money(t.amount,currency)}</td><td><button className="icon-button" title="Delete transaction" onClick={()=>setTransactions(p=>p.filter(x=>x.id!==t.id))}><Trash2 size={15}/></button></td></tr>})}</tbody></table>{!filtered.length&&<div className="empty small-empty">No matching transactions.</div>}</div>
      </section>}

      {tab==="summary"&&<section className="panel">
        <div className="panel-heading"><div><div className="eyebrow">SPENDING BREAKDOWN</div><h2>Category summary</h2><p>Only categorized transactions are included in the chart.</p></div></div>
        {!byCategory.length?<div className="empty"><PieChart size={28}/><h3>No categorized spending yet</h3><p>Categorize transactions to see your breakdown.</p></div>:<div className="charts"><div className="chart-card"><h3>Spend by category</h3><ResponsiveContainer width="100%" height={280}><RePieChart><Pie data={chartData} dataKey="amount" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>{chartData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Pie><Tooltip formatter={v=>money(v,currency)}/></RePieChart></ResponsiveContainer></div><div className="chart-card"><h3>Category totals</h3><ResponsiveContainer width="100%" height={280}><BarChart data={chartData} layout="vertical" margin={{left:15,right:20}}><CartesianGrid strokeDasharray="3 3" stroke="#263247"/><XAxis type="number" tick={{fill:"#9aa8bb",fontSize:11}}/><YAxis type="category" dataKey="name" width={125} tick={{fill:"#cbd5e1",fontSize:11}}/><Tooltip formatter={v=>money(v,currency)}/><Bar dataKey="amount" radius={[0,5,5,0]}>{chartData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Bar></BarChart></ResponsiveContainer></div></div>}
        <div className="summary-list">{byCategory.sort((a,b)=>b.value-a.value).map(c=><div className="summary-row" key={c.id}><span className="color-dot" style={{background:PALETTE[c.color]}}/><span>{c.name}</span><b>{money(c.value,currency)}</b></div>)}</div>
        <div className="category-admin"><h3>Manage categories</h3>{categories.map(c=><div className="manage-row" key={c.id}><span className="color-dot" style={{background:PALETTE[c.color]}}/><span>{c.name}</span><button className="icon-button danger" onClick={()=>{setCategories(p=>p.filter(x=>x.id!==c.id));setTransactions(p=>p.map(t=>t.categoryId===c.id?{...t,categoryId:null}:t));notify("Category removed; its transactions need review.");}}><Trash2 size={15}/></button></div>)}</div>
      </section>}
      <footer>FinFlow stores data in this browser only. Export CSV regularly as a backup.</footer>
    </main>
    {toast&&<div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
