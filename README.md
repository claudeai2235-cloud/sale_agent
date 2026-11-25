# Thiri — AI Sales & Customer Service Agent (Messenger + Telegram)

မြန်မာလုပ်ငန်းရှင်တွေအတွက် Facebook Messenger နဲ့ Telegram ကနေ လူတစ်ယောက်လို ရောင်းပေးတဲ့ AI အရောင်းဝန်ထမ်း **Thiri** နဲ့
လုပ်ငန်းများစွာကို တစ်နေရာတည်းကနေ ထိန်းချုပ်နိုင်တဲ့ **Bot Control Center**။

## ပါဝင်တဲ့ Feature များ

| အပိုင်း | အသေးစိတ် |
|---|---|
| 🤖 Thiri (AI) | Gemini နဲ့ အလုပ်လုပ်ပါတယ်။ မြန်မာလို တိုတိုရှင်းရှင်း ပြောပြီး “ရှင်/ရှင့်” သုံးပါတယ်။ Customer ရဲ့ လိုအပ်ချက်ကို အရင်ရှာ၊ အကျိုးကျေးဇူးနဲ့ ချိတ်ဆက်၊ Objection ကို ဖြေရှင်းပြီး Sale ပိတ်ပါတယ်။ အပြင်က မေးခွန်းကို တိုတိုဖြေပြီး အရောင်းဘက် ပြန်ဆွဲပါတယ်။ |
| 📋 လုပ်ငန်း Data | မေးခွန်း ၂၆ ခုပါတဲ့ လမ်းညွှန် (ဘာကြောင့်လိုလဲ + ဥပမာ)၊ ပစ္စည်း/Course၊ FAQ၊ Objection၊ ငွေပေးချေမှု |
| 🧾 Order ပိတ်ခြင်း | သတ်မှတ်ထားတဲ့ အချက်အလက် (အမည်၊ ဖုန်း၊ Gmail…) မပြည့်မချင်း Order မတင်ပါ။ စျေးကို Database ကနေ တွက်ပြီး Account နံပါတ်ကို System က အတိအကျ ပို့ပါတယ် (AI က မရေးပါ) |
| 💰 ငွေလွှဲ Screenshot | AI က ပုံကို ကြည့်ပြီး ငွေလွှဲပြေစာ ဟုတ်/မဟုတ်၊ ပမာဏ စစ်ပါတယ်။ Admin Telegram ကို ✅/❌ ခလုတ်နဲ့ ပို့ပါတယ် |
| 🙋 လူကိုလွှဲခြင်း | Complaint၊ လူနဲ့ပြောချင်၊ Refund၊ Discount ကန့်သတ်ချက်ကျော်၊ ငွေလွှဲပြဿနာ၊ စိတ်ဆိုး၊ မသေချာ၊ Keyword၊ ကိုယ်ပိုင်စည်းမျဉ်း — တစ်ခုချင်း ဖွင့်/ပိတ်လို့ရ။ Telegram အကြောင်းကြားစာကို **Reply ပြန်ရုံနဲ့ Customer ဆီ ရောက်ပါတယ်** |
| ⏰ Follow-up | Customer စာမပြန်တော့ရင် ယခင်စကားဝိုင်းကို မှတ်မိပြီး လူတစ်ယောက်ချင်းစီအတွက် ရေးတဲ့ Follow-up (Messenger 24h rule လိုက်နာ)၊ ငွေမလွှဲသေးရင် သတိပေးချက်၊ ညဘက် မပို့ |
| 📥 မဖြေရသေးတာ | Messenger မှာ မဖြေရသေးတဲ့ Conversation တွေကို ဆွဲယူပြီး ၂၄ နာရီအတွင်းဟာတွေကို Thiri ဖြေ၊ ကျော်တာကို Inbox မှာ ပြ |
| 🧠 AI သင်ယူမှု | ပြီးသွားတဲ့ စကားဝိုင်းတွေ၊ Admin ကိုယ်တိုင်ဖြေခဲ့တာတွေကနေ FAQ/Objection/Insight အသစ်ကို အဆိုပြု → သင်အတည်ပြုမှ သုံး |
| 📈 Growth Insights | Funnel၊ လိုအပ်ချက်၊ ပြဿနာ၊ မဝယ်ရခြင်း၊ စာပို့ချိန်၊ AI Growth Report |
| 🔤 Zawgyi | Zawgyi နဲ့ ရိုက်တဲ့စာကို Unicode အလိုအလျောက် ပြောင်း |
| 💼 Telegram Business | Premium Account ထဲက Chat တွေကို Thiri ဖြေ၊ ကိုယ်တိုင်ဝင်ရေးရင် ရပ်ပေး |
| 🏢 Control Center | လုပ်ငန်းအသစ် ဖန်တီး (Template ကူးလို့ရ)၊ လစဉ်ကြေး/သက်တမ်း/Grace၊ Login ပေး/မပေး၊ AI အသုံးပြုမှု၊ Emergency stop |

## Deploy လုပ်နည်း (Vercel)

1. **GitHub** မှာ ဒီ Code ကို Push လုပ်ပါ။
2. **Vercel** → *Add New Project* → GitHub repo ကို Import လုပ်ပါ။
3. **Database**: Vercel Project → *Storage* → **Neon (Postgres)** ကို ထည့်ပါ → `DATABASE_URL` အလိုအလျောက် ရပါမယ်။
4. **Environment Variables** (`.env.example` ကို ကြည့်ပါ):
   - `GEMINI_API_KEY` — https://aistudio.google.com/apikey
   - `ENCRYPTION_KEY`, `SESSION_SECRET`, `SETUP_SECRET`, `CRON_SECRET` — စာလုံး ၃၂ လုံးကျော် random (`openssl rand -base64 32`)
   - `APP_URL` — ဥပမာ `https://your-app.vercel.app`
   - `META_APP_SECRET`, `META_VERIFY_TOKEN` — Messenger သုံးမှ
5. **Deploy** → Build အချိန်မှာ Database table တွေ အလိုအလျောက် ဖန်တီးပါတယ်။
6. `https://your-app.vercel.app/setup` ကိုဖွင့်ပြီး Super Admin Account ဖန်တီးပါ။
7. Control Center → **+ အသစ်** → သင့်လုပ်ငန်းကို ဖန်တီးပါ (သက်တမ်း `0` = အကန့်အသတ်မဲ့)။
8. Dashboard → **လုပ်ငန်းအချက်အလက်**၊ **ပစ္စည်း**၊ **ငွေပေးချေမှု** ဖြည့်ပြီး **Thiri ကို စမ်းရန်** မှာ စမ်းကြည့်ပါ။

### Telegram
Dashboard → *Messenger / Telegram* → @BotFather က Token ထည့်ပါ။ Webhook ကို အလိုအလျောက် သတ်မှတ်ပါတယ်။
Admin အကြောင်းကြားချက်ရဖို့ Bot ကို `/admin <CODE>` ပို့ပါ (Code က အဲ့စာမျက်နှာမှာ ရှိ)။

### Facebook Messenger (Meta App တစ်ခုတည်းနဲ့ လုပ်ငန်းအားလုံး)
1. https://developers.facebook.com → App ဖန်တီး → **Messenger** product ထည့်ပါ။
2. Webhook: Callback URL = `https://your-app.vercel.app/api/webhooks/messenger`၊ Verify token = `META_VERIFY_TOKEN`
   → `messages`, `messaging_postbacks`, `message_echoes` ကို Subscribe လုပ်ပါ။
3. App Settings → Basic → **App Secret** ကို `META_APP_SECRET` ထဲ ထည့်ပါ။
4. Page Access Token ကို Dashboard → *Messenger / Telegram* မှာ ထည့်ပါ။
5. **တခြားလုပ်ငန်းရှင်တွေရဲ့ Page ချိတ်ဖို့** — Meta **Business Verification** နဲ့ **App Review** (`pages_messaging`, `pages_read_engagement`, `pages_manage_metadata` Advanced Access) အောင်ရပါမယ်။ မအောင်ခင်မှာ App ရဲ့ Admin/Tester ဖြစ်တဲ့ Page တွေမှာပဲ အလုပ်လုပ်ပါတယ်။

### Follow-up / Learning / Billing (Cron)
`/api/cron?key=<CRON_SECRET>` ကို ၅–၁၀ မိနစ်တစ်ခါ ခေါ်ပေးရပါမယ်:
- **အခမဲ့**: https://cron-job.org မှာ အဲ့ URL ကို 5 မိနစ်တစ်ခါ သတ်မှတ်ပါ။
- **Vercel Pro**: Project → Settings → Cron/Schedules မှာ `*/5 * * * *` နဲ့ `/api/cron` ကို ထည့်ပါ (Vercel က `Authorization: Bearer CRON_SECRET` ပို့ပါတယ်)။
(Message ဝင်လာတိုင်းလည်း Background မှာ အလိုအလျောက် Run ပါတယ်။)

## AI Model
Control Center → *Platform Setting* မှာ ပြောင်းလို့ရပါတယ်။ Default:
- Chat: `gemini-flash-latest` (Google ရဲ့ နောက်ဆုံး Flash ကို အလိုအလျောက် ညွှန်)
- Learning/Backup: `gemini-flash-lite-latest` (စျေးအသက်သာဆုံး)
- Thinking = **Low** (မြန်ပြီး စျေးသက်သာ — လုပ်ငန်းတစ်ခုချင်း ပြောင်းလို့ရ)

## သိထားရမယ့် ကန့်သတ်ချက်များ
- **Messenger 24 နာရီ rule**: Customer ရဲ့ နောက်ဆုံးစာကနေ ၂၄ နာရီကျော်ရင် Bot က အရောင်းစာ ပို့ခွင့်မရှိ (Meta policy)။ လူကိုယ်တိုင်ဖြေတာကို `HUMAN_AGENT` tag (Meta ခွင့်ပြုချက်လို) နဲ့ ၇ ရက်အထိ ပို့နိုင်ပါတယ်။
- **Telegram**: Customer က `/start` နှိပ်ထားမှ စကားပြောလို့ရ၊ Message အဟောင်း History ကို ဆွဲယူလို့မရ။
- **AI သင်ယူမှု** က Model ကို ပြန်လေ့ကျင့်တာ မဟုတ်ပါ — သင်အတည်ပြုထားတဲ့ အသိပညာ (FAQ/Objection/Insight) တိုးလာပြီး နောက် Customer တွေမှာ သုံးတာပါ။ ဒါကြောင့် မှားတာ အလိုလို မဝင်ပါ။
- Customer က တကယ်လေးလေးနက်နက် “Bot လား” မေးရင် Thiri က လိမ်မဖြေပါ (AI assistant ဖြစ်ကြောင်း သဘာဝကျကျ ပြောပြီး ဆက်ကူညီပါတယ်)။

## Local Development
```bash
cp .env.example .env.local   # values ဖြည့်ပါ
npm install
npm run db:migrate
npm run dev
npm test
npm run simulate -- --reset "မင်္ဂလာပါ" "ဈေးဘယ်လောက်လဲ"   # Thiri နဲ့ Terminal ကနေ စမ်းရန်
```

## Project Structure
```
src/lib/agent/prompt.ts     Thiri ရဲ့ Persona + Sales psychology prompt + JSON schema
src/lib/agent/engine.ts     Message → AI → Order/Handoff/Payment → Reply
src/lib/agent/jobs.ts       Follow-up, Payment reminder, Learning, Billing, Daily summary
src/lib/agent/admin-bot.ts  Telegram Admin (ခလုတ်များ၊ Reply-to-customer၊ /admin linking)
src/lib/questionnaire.ts    လုပ်ငန်း Data မေးခွန်းများ
src/app/t/[tenantId]/       လုပ်ငန်း Dashboard (မြန်မာ UI)
src/app/control/            Bot Control Center (Super Admin)
src/app/api/webhooks/       Messenger / Telegram webhooks
```
