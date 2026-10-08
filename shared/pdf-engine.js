import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DOC_TITLE, LEGAL_NAME, SIG_META, declarationIntro } from "./document-meta.js";
const LOGO_RATIO = 514 / 382;
const INK = [11, 27, 58];
const BODY = [50, 58, 74];
const MUTED = [128, 128, 128];
const LINE = [222, 222, 222];
const BRAND = [242, 106, 33];
const PT = 0.3528; // mm per point
const PAGE_W = 210;
const ML = 20;
const MR = 20;
const CW = PAGE_W - ML - MR;
const TOP = 20;
const BOTTOM = 272;
const fmtDateTime = (iso) => {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (isNaN(+d))
        return iso;
    return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtDate = (iso) => {
    if (!iso)
        return "";
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    if (isNaN(+d))
        return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const toBase64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
};
const slug = (s) => s
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "employee";
export async function buildPdf(state, ref, logo) {
    const f = state.fields;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    doc.setProperties({
        title: `${DOC_TITLE} - ${f.employeeName || "Employee"}`,
        subject: `Reference ${ref}`,
        author: LEGAL_NAME,
        creator: "Physique 57 Asset Declaration",
    });
    let y = TOP;
    const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const stroke = (c, w = 0.2) => {
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setLineWidth(w);
    };
    const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const hair = (x1, x2, yy, c = LINE, w = 0.2) => {
        stroke(c, w);
        doc.line(x1, yy, x2, yy);
    };
    const newPage = () => {
        doc.addPage();
        y = TOP;
    };
    const ensure = (h) => {
        if (y + h > BOTTOM)
            newPage();
    };
    const lines = (t, w, size, style, font = "helvetica") => {
        doc.setFont(font, style);
        doc.setFontSize(size);
        return doc.splitTextToSize(t || " ", w);
    };
    const para = (t, o = {}) => {
        const size = o.size ?? 9;
        const lh = (o.lh ?? 1.6) * size * PT;
        const ls = lines(t, o.w ?? CW, size, o.style ?? "normal");
        color(o.color ?? BODY);
        for (const ln of ls) {
            ensure(lh);
            doc.text(ln, o.x ?? ML, y, { baseline: "top" });
            y += lh;
        }
        y += o.after ?? 0;
    };
    const section = (num, label) => {
        ensure(18);
        const upper = label.toUpperCase();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setCharSpace(0);
        const w = doc.getTextWidth(upper) + upper.length * 0.35;
        doc.setCharSpace(0.35);
        color(BRAND);
        doc.text(num, ML, y, { baseline: "top" });
        color(INK);
        doc.text(upper, ML + 8, y, { baseline: "top" });
        doc.setCharSpace(0);
        hair(ML + 8 + w + 4, ML + CW, y + 1.25);
        y += 8;
    };
    /* ───────── Letterhead ───────── */
    const logoH = 21;
    doc.addImage(logo, "PNG", ML, 12, logoH * LOGO_RATIO, logoH);
    const rx = ML + CW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    color(MUTED);
    doc.text("REFERENCE NO.", rx, 14, { align: "right", baseline: "top" });
    doc.text("GENERATED", rx, 25, { align: "right", baseline: "top" });
    doc.setFontSize(9.5);
    color(INK);
    doc.text(ref, rx, 18, { align: "right", baseline: "top" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(fmtDateTime(new Date().toISOString()), rx, 29, { align: "right", baseline: "top" });
    hair(ML, ML + CW, 38);
    y = 48;
    /* ───────── Title (centred, matching the original form) ───────── */
    color(INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("AMP FITNESS LLP", PAGE_W / 2, y + 2, { align: "center", baseline: "top" });
    y += 7;
    doc.setFontSize(9.5);
    doc.text(DOC_TITLE, PAGE_W / 2, y + 2, { align: "center", baseline: "top" });
    y += 8;
    fill(BRAND);
    doc.rect(PAGE_W / 2 - 7, y, 14, 0.8, "F");
    y += 6;
    /* ───────── Employee details ───────── */
    const colW = (CW - 14) / 2;
    const cell = (label, value, x, w) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        color(MUTED);
        doc.setCharSpace(0.3);
        doc.text(label.toUpperCase(), x, y, { baseline: "top" });
        doc.setCharSpace(0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        color(INK);
        const v = doc.splitTextToSize(value || "-", w)[0];
        doc.text(v, x, y + 4, { baseline: "top" });
        hair(x, x + w, y + 10.2);
    };
    cell("Employee Name", f.employeeName, ML, colW);
    cell("Employee ID", f.employeeId, ML + colW + 14, colW);
    y += 14;
    cell("Designation", f.designation, ML, colW);
    cell("Department", f.department, ML + colW + 14, colW);
    y += 14;
    cell("Date & Time of Issue", fmtDateTime(f.issueDate), ML, colW);
    y += 18;
    /* ───────── Intro ───────── */
    const name = f.declName.trim() || "______________________";
    para(`I, Mr./Ms./Mrs. ${name}${declarationIntro(state)}`, { size: 9.5, color: INK, after: 7 });
    /* ───────── 01 Asset details ───────── */
    section("01", "Asset Details");
    const assets = state.assets.filter((a) => a.name.trim() || a.serial.trim());
    autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR, top: TOP, bottom: 300 - BOTTOM - 1 },
        theme: "plain",
        head: [["#", "COMPANY ASSET", "ASSET / SERIAL NO.", "CONDITION AT ISSUE", "REMARKS"]],
        body: assets.map((a, i) => [String(i + 1), a.name || "-", a.serial || "-", a.condition || "-", a.remarks || "-"]),
        styles: {
            font: "helvetica",
            fontSize: 8.5,
            textColor: INK,
            cellPadding: { top: 2.6, bottom: 2.6, left: 1.6, right: 1.6 },
            overflow: "linebreak",
        },
        headStyles: {
            fontStyle: "bold",
            fontSize: 6.2,
            textColor: MUTED,
            cellPadding: { top: 1.2, bottom: 2.4, left: 1.6, right: 1.6 },
        },
        columnStyles: {
            0: { cellWidth: 10, textColor: MUTED },
            1: { cellWidth: 44, fontStyle: "bold" },
            2: { cellWidth: 38 },
            3: { cellWidth: 32 },
            4: { cellWidth: 46 },
        },
        didDrawCell: (d) => {
            const { x, y: cy, width, height } = d.cell;
            if (d.section === "head")
                hair(x, x + width, cy + height, INK, 0.35);
            else
                hair(x, x + width, cy + height, LINE, 0.2);
        },
    });
    const tbl = doc;
    y = (tbl.lastAutoTable?.finalY ?? y + 30) + 9;
    /* ───────── 02 Objective / 03 Scope ───────── */
    section("02", "Objective");
    para(state.objective, { after: 7 });
    section("03", "Scope");
    para(state.scope, { after: 7 });
    /* ───────── 04 Terms ───────── */
    section("04", "Terms & Conditions");
    state.terms.forEach((t, i) => {
        const tw = CW - 9;
        const ls = lines(t.text, tw, 9, "normal");
        const lh = 1.6 * 9 * PT;
        ensure(ls.length * lh + 3);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        color(BRAND);
        doc.text(String(i + 1).padStart(2, "0"), ML, y + 0.4, { baseline: "top" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        color(BODY);
        ls.forEach((ln, k) => doc.text(ln, ML + 9, y + k * lh, { baseline: "top" }));
        y += ls.length * lh + 3;
    });
    y += 4;
    /* ───────── 05 Declaration ───────── */
    const dw = CW - 6;
    const l1 = lines(state.declaration1, dw, 9, "normal");
    const l2 = lines(state.declaration2, dw, 9, "normal");
    const dlh = 1.6 * 9 * PT;
    const dh = (l1.length + l2.length) * dlh + 3;
    ensure(dh + 12);
    section("05", "Employee Declaration & Undertaking");
    stroke(BRAND, 0.8);
    doc.line(ML + 0.4, y, ML + 0.4, y + dh - 1);
    color(INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    l1.forEach((ln, k) => doc.text(ln, ML + 6, y + k * dlh, { baseline: "top" }));
    const y2 = y + l1.length * dlh + 3;
    l2.forEach((ln, k) => doc.text(ln, ML + 6, y2 + k * dlh, { baseline: "top" }));
    y += dh + 8;
    /* ───────── 06 Signatures ───────── */
    ensure(70);
    section("06", "Signatures");
    const gap = 8;
    const sw = (CW - gap * 2) / 3;
    const top = y;
    SIG_META.forEach((m, i) => {
        const x = ML + i * (sw + gap);
        const b = state.sigs[m.key];
        let yy = top;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        color(INK);
        doc.setCharSpace(0.2);
        const lab = doc.splitTextToSize(m.label.toUpperCase(), sw - 4);
        lab.slice(0, 2).forEach((ln, k) => doc.text(ln, x, yy + k * 3, { baseline: "top" }));
        doc.setCharSpace(0);
        yy += 8;
        const areaH = 20;
        const baseY = yy + areaH;
        if (b.sig) {
            try {
                const p = doc.getImageProperties(b.sig.image);
                const sc = Math.min(sw / p.width, (areaH - 2) / p.height);
                const w = p.width * sc;
                const h = p.height * sc;
                doc.addImage(b.sig.image, "PNG", x, baseY - h - 0.5, w, h);
            }
            catch {
                /* skip unreadable image */
            }
        }
        else {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(8);
            color(MUTED);
            doc.text("Pending signature", x, baseY - 5, { baseline: "top" });
        }
        hair(x, x + sw, baseY, INK, 0.3);
        yy = baseY + 2.4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        color(INK);
        doc.text(doc.splitTextToSize(b.name || "-", sw)[0], x, yy, { baseline: "top" });
        yy += 5;
        doc.setFontSize(7.5);
        color(MUTED);
        doc.text(`Date: ${fmtDate(b.date) || "-"}`, x, yy, { baseline: "top" });
        yy += 4.2;
        if (b.signedAt) {
            doc.setFontSize(6.2);
            doc.text(`Signed electronically ${fmtDateTime(b.signedAt)}`, x, yy, { baseline: "top" });
        }
    });
    y = top + 8 + 20 + 22;
    /* ───────── Page chrome ───────── */
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        fill(BRAND);
        doc.rect(0, 0, PAGE_W, 1.4, "F");
        hair(ML, ML + CW, 284);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        color(INK);
        doc.text(LEGAL_NAME.toUpperCase(), ML, 287, { baseline: "top" });
        doc.setFont("helvetica", "normal");
        color(MUTED);
        doc.text(`${DOC_TITLE}  |  ${ref}`, PAGE_W / 2, 287, { align: "center", baseline: "top" });
        doc.text(`Page ${p} of ${total}`, ML + CW, 287, { align: "right", baseline: "top" });
    }
    const buf = doc.output("arraybuffer");
    return {
        blob: new Blob([buf], { type: "application/pdf" }),
        base64: toBase64(buf),
        filename: `Asset-Declaration_${slug(f.employeeName)}_${ref}.pdf`,
    };
}
