import { describe, expect, it } from "vitest";

import { countKnowledgeTokens, selectKnowledgeWithinBudget } from "./tokenBudget";

describe("knowledge token budget", () => {
  it("counts words, digit groups, symbols and line breaks", () => {
    expect(countKnowledgeTokens("")).toBe(0);
    expect(countKnowledgeTokens("Parking is free.")).toBe(5);
    expect(countKnowledgeTokens("1250")).toBe(2);
    expect(countKnowledgeTokens("éé\n")).toBe(2);
  });

  // Real o200k counts, measured with js-tiktoken 1.0.21.
  it.each([
    ["an English passage", "Our clinic is open Monday to Friday from 8 a.m. to 6 p.m. Parking is free behind the building. New patients should arrive 15 minutes early to fill out forms.", 39],
    ["a French passage", "Notre clinique est ouverte du lundi au vendredi de 8 h à 18 h. Le stationnement est gratuit derrière l’édifice.", 28],
    [
      "a JSON passage with UUIDs",
      JSON.stringify({ chunkId: "3f2b8c1e-5a7d-4e2b-9c6f-1d8a0b4e7f21", documentId: "9a1c4e7b-2d3f-4b8a-8e5c-6f0d1a2b3c4d", content: "Parking is free behind the building." }),
      90,
    ],
    ["a Chinese passage", "我们的诊所周一至周五上午八点至下午六点营业。大楼后面有免费停车场。新患者应提前十五分钟到达填写表格。", 38],
    ["a Japanese passage", "当クリニックは月曜日から金曜日の午前8時から午後6時まで営業しています。建物の裏に無料駐車場があります。", 35],
    ["a Korean passage", "저희 병원은 월요일부터 금요일까지 오전 8시부터 오후 6시까지 운영합니다. 건물 뒤에 무료 주차장이 있습니다.", 34],
    ["a Russian passage", "Наша клиника открыта с понедельника по пятницу с 8 до 18 часов. Бесплатная парковка находится за зданием. Новым пациентам следует прийти за пятнадцать минут.", 43],
    ["an Arabic passage", "عيادتنا مفتوحة من الاثنين إلى الجمعة من الساعة 8 صباحًا حتى 6 مساءً. يوجد موقف مجاني خلف المبنى.", 28],
    ["a Hebrew passage", "המרפאה שלנו פתוחה מיום שני עד שישי משעה 8 בבוקר עד 6 בערב. יש חניה חינם מאחורי הבניין.", 37],
    ["a Hindi passage", "हमारा क्लिनिक सोमवार से शुक्रवार सुबह 8 बजे से शाम 6 बजे तक खुला रहता है। इमारत के पीछे मुफ्त पार्किंग है।", 33],
  ])("does not undercount %s", (_label, text, realTokens) => {
    const estimate = countKnowledgeTokens(text);
    expect(estimate).toBeGreaterThanOrEqual(realTokens);
    expect(estimate).toBeLessThanOrEqual(Math.ceil(realTokens * 2.5));
  });

  it("skips items that would exceed the budget and keeps later ones that fit", () => {
    expect(selectKnowledgeWithinBudget(["word ".repeat(10), "short", "tiny"], 3, value => value)).toEqual(["short"]);
  });
});
