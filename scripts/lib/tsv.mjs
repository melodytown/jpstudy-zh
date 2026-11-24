// 最小 TSV 解析器（RFC4180 风格，允许字段内出现 \t / \n / "" 转义）。
// Anki 导出的 notes.csv 就是这样：制表符分隔，含特殊字符的字段用双引号包裹。

export function parseTsv(text, delim = "\t") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }

    if (c === '"' && field === "") { inQuotes = true; i += 1; continue; }
    if (c === delim) { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }

    field += c; i += 1;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}