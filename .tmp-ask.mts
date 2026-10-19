import { answerQuestion } from "./src/server/rag/assistant";
const qs = [
  "ما هي أركان الإسلام؟",
  "ما معنى آية الكرسي؟",
  "من هو ذو القرنين؟",
  "ما فضل سورة الملك؟",
  "كم عدد آيات سورة البقرة؟",
  "ما معنى كلمة الصمد؟",
  "لماذا سميت سورة الكهف بهذا الاسم؟",
  "ما قصة أصحاب الفيل؟",
];
for (const q of qs) {
  const a = await answerQuestion({ question: q });
  const text = a.text.replace(/\s+/g, " ").slice(0, 230);
  console.log(`\n■ ${q}\n  type=${a.answerType} provider=${a.provider} abstained=${a.abstained} cites=${a.citations.length}\n  → ${text}`);
}
