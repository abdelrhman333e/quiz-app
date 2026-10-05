المسابقة v2 — حسابات + قاعدة بيانات
1) Supabase: Project ← زرار Connect ← Session pooler ← انسخ الـ URI وبدّل [YOUR-PASSWORD] بكلمة سر القاعدة.
2) Render: New ← Web Service ← اختار المستودع.
   Build Command: npm install     Start Command: node server.js     Instance: Free
   Environment: DATABASE_URL = الرابط اللي نسخته      SESSION_SECRET = أي نص عشوائي طويل
3) افتح رابط Render ← حساب جديد ← بيدخلك التابلت ← "نسخ رابط الشاشة".
تجربة محلية: DATABASE_URL=... node server.js
من التابلت استخدم "تصدير الأسئلة" لتنزيل نسخة JSON، أو "استيراد أسئلة" لإضافة أسئلة نسخة سابقة دون حذف أسئلتك الحالية. تتضمن النسخة ملفات الصوت المرفوعة (بإجمالي أقصى 50 ميجابايت).
