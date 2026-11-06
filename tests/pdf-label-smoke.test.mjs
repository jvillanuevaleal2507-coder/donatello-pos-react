import test from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

test("genera una etiqueta QR válida en PDF tamaño carta", async () => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
  });
  const qr = await QRCode.toDataURL("DONATELLO-TEST-QR", {
    width: 420,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const x = 10;
  const y = 10;
  doc.setDrawColor(230, 210, 170);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, 95, 45, 2, 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Ventas Donatello", 57, y + 5, { align: "center" });
  doc.addImage(qr, "PNG", 46, y + 7, 23, 23);
  doc.setFontSize(9.5);
  doc.text("$1,800.00", 57, y + 44, { align: "center" });
  const pdfBytes = Buffer.from(doc.output("arraybuffer"));
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdfBytes.length > 3000, "PDF generado no debe estar vacío");
  assert.ok(doc.getNumberOfPages() === 1);
});

test("la dependencia AutoTable nueva es compatible con la API de jsPDF", () => {
  const doc = new jsPDF();
  autoTable(doc, { head: [["Producto", "Precio"]], body: [["Mesa", "$2,000"]] });
  const bytes = Buffer.from(doc.output("arraybuffer"));
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length > 3000);
});
