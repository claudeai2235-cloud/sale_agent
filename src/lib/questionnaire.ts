/**
 * The business questionnaire. Each answer is stored in tenants.profile[key]
 * and injected into the sales agent's knowledge. `why` tells the owner why
 * Thiri needs it, `example` shows a good answer.
 */

export type Question = {
  key: string;
  label: string;
  why: string;
  example: string;
  long?: boolean;
  important?: boolean;
};

export type Section = { key: string; title: string; intro: string; questions: Question[] };

export const QUESTIONNAIRE: Section[] = [
  {
    key: "basics",
    title: "၁။ လုပ်ငန်း အခြေခံအချက်များ",
    intro: "Customer က “ဘယ်သူတွေလဲ၊ ယုံရလား” ဆိုတာကို ပထမဆုံး သိချင်ပါတယ်။",
    questions: [
      { key: "business_name", label: "လုပ်ငန်းအမည်", why: "Thiri က မိတ်ဆက်တဲ့အခါ သုံးမယ်", example: "Zwel AI Academy", important: true },
      {
        key: "business_what",
        label: "ဘာလုပ်တဲ့ လုပ်ငန်းလဲ (၂-၃ ကြောင်း)",
        why: "“ဘာတွေလုပ်ပေးတာလဲ” လို့ မေးရင် တိုတိုရှင်းရှင်း ဖြေနိုင်ဖို့",
        example: "အလုပ်ရှင်နဲ့ ဝန်ထမ်းတွေ AI ကို နေ့စဉ်အလုပ်မှာ လက်တွေ့သုံးတတ်အောင် ၇ ရက်အတွင်း Video Course နဲ့ သင်ပေးပါတယ်။",
        long: true,
        important: true,
      },
      {
        key: "business_story",
        label: "လုပ်ငန်းရှင် / ဆရာ အကြောင်း နဲ့ ယုံကြည်ရလောက်တဲ့ အတွေ့အကြုံ",
        why: "ယုံကြည်မှု (Authority) တည်ဆောက်ဖို့",
        example: "AI Automation နယ်ပယ်မှာ ၃ နှစ်ကျော် လုပ်ကိုင်ခဲ့ပြီး လုပ်ငန်း ၅၀ ကျော်ကို AI စနစ် ထည့်သွင်းပေးခဲ့ပါတယ်။",
        long: true,
      },
      { key: "location", label: "တည်နေရာ / Online သာလား", why: "“ဆိုင်ဘယ်မှာလဲ” မေးရင် ဖြေဖို့", example: "Online သီးသန့်ပါ (ရန်ကုန်)" },
      { key: "hours", label: "ဖွင့်ချိန် / Admin ဖြေနိုင်တဲ့အချိန်", why: "လူနဲ့ ချိတ်ပေးရမယ့်အခါ အချိန်ပြောပြနိုင်ဖို့", example: "နေ့စဉ် မနက် ၉ နာရီ - ည ၉ နာရီ" },
      { key: "contact", label: "ဆက်သွယ်ရန် ဖုန်း / Link များ", why: "Customer တောင်းဆိုရင် ပေးဖို့", example: "09-xxx xxx xxx, Telegram: @zwelsale_bot" },
    ],
  },
  {
    key: "customer",
    title: "၂။ ဝယ်သူ (Target Customer) နားလည်မှု",
    intro: "ဒီအပိုင်းက အရေးအကြီးဆုံးပါ။ Customer ဘာကြောင့် ဝယ်တာလဲ ဆိုတာ Thiri သိမှ သူ့လိုအပ်ချက်နဲ့ ကိုက်အောင် ပြောနိုင်မှာပါ။",
    questions: [
      {
        key: "ideal_customer",
        label: "ဘယ်လိုလူတွေက အဓိက ဝယ်ကြလဲ",
        why: "Customer အမျိုးအစားကို ခွဲခြားပြီး သူနဲ့ကိုက်တဲ့ စကားသုံးဖို့",
        example: "လုပ်ငန်းငယ်ပိုင်ရှင်၊ Online seller၊ အလုပ်ပိုမြန်ချင်တဲ့ ရုံးဝန်ထမ်း၊ AI ကို စစချင်းလေ့လာချင်သူ",
        long: true,
        important: true,
      },
      {
        key: "pain_points",
        label: "မဝယ်ခင် သူတို့ ကြုံနေရတဲ့ ပြဿနာ / အခက်အခဲများ",
        why: "ပြဿနာကို ထိထိမိမိ ထောက်ပြပြီး ဖြေရှင်းချက်အဖြစ် ရောင်းဖို့ (Pain → Solution)",
        example: "Content ရေးရတာ အချိန်ကုန်၊ Customer စာပြန်မနိုင်၊ AI ကြားဖူးပေမဲ့ ဘယ်ကစရမှန်းမသိ၊ English မကောင်းလို့ ကြောက်",
        long: true,
        important: true,
      },
      {
        key: "desires",
        label: "ဝယ်ပြီးရင် သူတို့ ရချင်တဲ့ ရလဒ် / အိပ်မက်",
        why: "ရလဒ်ကို မြင်ယောင်လာအောင် ပြောဖို့",
        example: "တစ်နေ့ ၃-၄ နာရီ သက်သာမယ်၊ ဝန်ထမ်းမခန့်ဘဲ အလုပ်တွေ အလိုအလျောက်ဖြစ်မယ်၊ ဝင်ငွေ တိုးမယ်",
        long: true,
        important: true,
      },
      { key: "buy_triggers", label: "ဝယ်ဖို့ ဆုံးဖြတ်စေတဲ့ အဓိက အကြောင်းရင်းများ", why: "ဘယ်အချက်ကို အလေးပေးပြောရမလဲ သိဖို့", example: "မြန်မာလို သင်ပေးတာ၊ ၇ ရက်တည်းနဲ့ပြီးတာ၊ လက်တွေ့ Template တွေပါတာ", long: true },
      { key: "not_for", label: "ဘယ်သူတွေနဲ့ မသင့်တော်ဘူးလဲ", why: "မကိုက်တဲ့သူကို အတင်းမရောင်းဘဲ ယုံကြည်မှု ထိန်းဖို့", example: "Programming အဆင့်မြင့် သင်ချင်သူ (ဒီ Course က Basic ဖြစ်လို့)" },
    ],
  },
  {
    key: "trust",
    title: "၃။ ကွာခြားချက် နဲ့ သက်သေ",
    intro: "“တခြားနေရာနဲ့ ဘာကွာလဲ” ဆိုတဲ့ မေးခွန်းကို ယုံကြည်စိတ်ချစွာ ဖြေနိုင်ဖို့ပါ။",
    questions: [
      { key: "usp", label: "တခြားသူတွေထက် ဘာကြောင့် ပိုကောင်းလဲ (USP)", why: "ပြိုင်ဘက်နဲ့ နှိုင်းယှဉ်မေးရင် ဖြေဖို့", example: "Theory မဟုတ်ဘဲ နေ့စဉ်အလုပ်မှာ ချက်ချင်းသုံးလို့ရတဲ့ Workflow ၂၀ ကို လိုက်လုပ်ရင်းသင်ရတယ်", long: true, important: true },
      { key: "proof", label: "သက်သေ — ကျောင်းသား/Customer အရေအတွက်၊ ရလဒ်၊ Review များ", why: "Social proof နဲ့ ယုံကြည်မှု မြှင့်ဖို့ (အမှန်တကယ် ရှိတာပဲ ရေးပါ)", example: "ကျောင်းသား ၃၀၀ ကျော်၊ Review 4.9/5၊ “Content ရေးချိန် ၇၀% သက်သာသွားတယ်” - မမေ (Online Seller)", long: true },
      { key: "guarantee", label: "အာမခံချက် / Support", why: "ဝယ်ရမှာ စိုးရိမ်မှုကို လျှော့ဖို့ (Risk reversal)", example: "Course ပြီးတဲ့အထိ Telegram Group မှာ မေးခွန်းမေးလို့ရ၊ တစ်သက်တာ ပြန်ကြည့်ခွင့်", long: true },
      { key: "competitors", label: "ပြိုင်ဘက်များ နဲ့ ကိုယ့်ဘက်က သာတဲ့အချက်", why: "ပြိုင်ဘက်ကို မထိခိုက်ဘဲ ကိုယ့်အားသာချက်ကို ပြောဖို့", example: "YouTube free video တွေက အစီအစဉ်မကျ၊ ကျွန်တော်တို့က Step-by-step နဲ့ Support ပါ", long: true },
    ],
  },
  {
    key: "pricing",
    title: "၄။ စျေးနှုန်း နဲ့ Promotion မူဝါဒ",
    intro: "စျေးနှုန်းအသေးစိတ်ကို “ပစ္စည်း/ဝန်ဆောင်မှု” စာမျက်နှာမှာ ထည့်ပါ။ ဒီမှာ မူဝါဒပဲ ရေးပါ။",
    questions: [
      { key: "promotion", label: "လက်ရှိ Promotion နဲ့ ကုန်ဆုံးမယ့်ရက်", why: "အခုဝယ်သင့်တဲ့ အကြောင်းပြချက် (Urgency) — အမှန်ဖြစ်ရပါမယ်", example: "ဒီလကုန်အထိ 30% Off — 150,000 ကနေ 105,000 ကျပ်", long: true, important: true },
      { key: "discount_policy", label: "စျေးဆစ်ရင် ဘယ်လိုလုပ်ရမလဲ", why: "Thiri က ဘယ်အထိ လျှော့ပေးခွင့်ရှိလဲ သိဖို့ (ကန့်သတ်ချက်ကျော်ရင် လူကိုလွှဲမယ်)", example: "Promotion စျေးထက် ထပ်မလျှော့ပါ။ ၂ ယောက်တွဲဝယ်ရင် တစ်ယောက် 10,000 ထပ်လျှော့", long: true },
      { key: "upsell", label: "တွဲရောင်းနိုင်တဲ့ / အဆင့်မြှင့်ရောင်းနိုင်တဲ့ အရာများ", why: "Order တန်ဖိုး တိုးဖို့", example: "Course + 1:1 Setup Session တွဲဝယ်ရင် 50,000 ပိုသက်သာ" },
    ],
  },
  {
    key: "process",
    title: "၅။ ဝယ်ယူပုံ နဲ့ ဝယ်ပြီးနောက်",
    intro: "Customer က “ငွေလွှဲပြီးရင် ဘာဆက်ဖြစ်မလဲ” ဆိုတာ ရှင်းရှင်းသိရင် ပိုမြန်မြန် ဆုံးဖြတ်ပါတယ်။",
    questions: [
      { key: "order_steps", label: "ဝယ်ယူတဲ့ အဆင့်များ", why: "Thiri က Order ပိတ်တဲ့အခါ လမ်းညွှန်ဖို့", example: "၁) Course ရွေး ၂) အမည်၊ ဖုန်း၊ Gmail ပေး ၃) KBZPay/WavePay နဲ့ လွှဲ ၄) Screenshot ပို့", long: true, important: true },
      { key: "delivery", label: "ငွေချေပြီးနောက် ဘယ်လို လက်ခံရမလဲ / ဘယ်လောက်ကြာလဲ", why: "“ဘယ်တော့ရမလဲ” မေးရင် ဖြေဖို့", example: "ငွေစစ်ပြီး ၃၀ မိနစ်အတွင်း Course Link နဲ့ Telegram Group Link ပို့ပေးပါတယ်", long: true, important: true },
      { key: "refund_policy", label: "ငွေပြန်အမ်း / လဲလှယ်မူဝါဒ", why: "မေးလာရင် မှန်ကန်စွာ ဖြေဖို့ (ပြန်အမ်းတောင်းရင် လူကိုလွှဲမယ်)", example: "Digital course ဖြစ်လို့ ငွေပြန်မအမ်းပါ၊ Link ပြဿနာရှိရင် အမြန်ဖြေရှင်းပေးပါတယ်", long: true },
      { key: "after_sales", label: "ဝယ်ပြီးနောက် Support", why: "ဝယ်ပြီးသူ မေးလာရင် ဖြေဖို့", example: "Telegram Group မှာ ဆရာကိုယ်တိုင် ဖြေပေး၊ Live Q&A လစဉ်" , long: true },
    ],
  },
  {
    key: "style",
    title: "၆။ အရောင်းစတိုင် နဲ့ တားမြစ်ချက်",
    intro: "Thiri ဘယ်လိုပြောရမလဲ၊ ဘာမပြောရဘူးလဲ ဆိုတာ သတ်မှတ်ပါ။",
    questions: [
      { key: "voice", label: "ပြောဆိုပုံ (Brand voice)", why: "Thiri ရဲ့ လေသံကို ကိုယ့်လုပ်ငန်းနဲ့ ကိုက်အောင်", example: "ဖော်ဖော်ရွေရွေ၊ အစ်မ/ညီမ လို ရင်းရင်းနှီးနှီး၊ ပညာရှင်ဆန်ဆန် ယုံကြည်စိတ်ချရ" },
      { key: "forbidden", label: "လုံးဝ မပြောရ / ကတိမပေးရတဲ့ အရာများ", why: "မှားယွင်းတဲ့ ကတိ၊ ပြဿနာဖြစ်စေမယ့် စကားတွေ ရှောင်ဖို့", example: "ဝင်ငွေ အာမခံတယ်လို့ မပြောရ၊ ပြိုင်ဘက်ကို နာမည်တပ် မဝေဖန်ရ", long: true, important: true },
      { key: "closing_notes", label: "Sale ပိတ်ရာမှာ ထူးခြားတဲ့ နည်းလမ်း / သိထားစေချင်တာ", why: "သင့်လုပ်ငန်းမှာ အလုပ်ဖြစ်တဲ့ နည်းကို Thiri သုံးဖို့", example: "Free Lesson 1 ပို့ပေးလိုက်ရင် ဝယ်နှုန်းများတယ်၊ Lesson Link: ...", long: true },
      { key: "extra", label: "တခြား သိထားစေချင်တဲ့ အချက်များ", why: "အပေါ်မှာ မပါတဲ့ အချက်အလက်", example: "Course ကို ဖုန်းနဲ့ပဲ ကြည့်လို့ရတယ်၊ Laptop မလိုဘူး", long: true },
    ],
  },
];

export const ALL_QUESTIONS = QUESTIONNAIRE.flatMap((s) => s.questions);

export function profileCompleteness(profile: Record<string, string>) {
  const filled = (q: Question) => (profile[q.key] ?? "").trim().length > 0;
  const important = ALL_QUESTIONS.filter((q) => q.important);
  return {
    total: ALL_QUESTIONS.length,
    filled: ALL_QUESTIONS.filter(filled).length,
    importantMissing: important.filter((q) => !filled(q)).map((q) => q.label),
    percent: Math.round((ALL_QUESTIONS.filter(filled).length / ALL_QUESTIONS.length) * 100),
  };
}
