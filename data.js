const countries = [
    {
        id: "egypt",
        coords: [26.8206, 30.8025],
        name: { en: "Egypt", he: "מצרים", ar: "مصر" },
        stats: {
            pop: { en: "111M", he: "111M", ar: "111M" },
            army_regular: { en: "438k", he: "438k", ar: "438k" },
            army_reserves: { en: "479k", he: "479k", ar: "479k" },
            tanks: { en: "4,664", he: "4,664", ar: "4,664" },
            aircraft: { en: "1,062", he: "1,062", ar: "1,062" },
            navy: { en: "245", he: "245", ar: "245" },
            submarines: { en: "8", he: "8", ar: "8" }
        }
    },
    {
        id: "saudi_arabia",
        coords: [23.8859, 45.0792],
        name: { en: "Saudi Arabia", he: "ערב הסעודית", ar: "السعودية" },
        stats: {
            pop: { en: "36M", he: "36M", ar: "36M" },
            army_regular: { en: "257k", he: "257k", ar: "257k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "1,273", he: "1,273", ar: "1,273" },
            aircraft: { en: "897", he: "897", ar: "897" },
            navy: { en: "55", he: "55", ar: "55" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "iran",
        coords: [32.4279, 53.6880],
        name: { en: "Iran", he: "איראן", ar: "إيران" },
        stats: {
            pop: { en: "88M", he: "88M", ar: "88M" },
            army_regular: { en: "610k", he: "610k", ar: "610k" },
            army_reserves: { en: "350k", he: "350k", ar: "350k" },
            tanks: { en: "4,071", he: "4,071", ar: "4,071" },
            aircraft: { en: "541", he: "541", ar: "541" },
            navy: { en: "101", he: "101", ar: "101" },
            submarines: { en: "19", he: "19", ar: "19" }
        }
    },
    {
        id: "turkey",
        coords: [38.9637, 35.2433],
        name: { en: "Turkey", he: "טורקיה", ar: "تركيا" },
        stats: {
            pop: { en: "85M", he: "85M", ar: "85M" },
            army_regular: { en: "355k", he: "355k", ar: "355k" },
            army_reserves: { en: "378k", he: "378k", ar: "378k" },
            tanks: { en: "2,229", he: "2,229", ar: "2,229" },
            aircraft: { en: "1,057", he: "1,057", ar: "1,057" },
            navy: { en: "154", he: "154", ar: "154" },
            submarines: { en: "12", he: "12", ar: "12" }
        }
    },
    {
        id: "iraq",
        coords: [33.2232, 43.6793],
        name: { en: "Iraq", he: "עיראק", ar: "العراق" },
        stats: {
            pop: { en: "44M", he: "44M", ar: "44M" },
            army_regular: { en: "193k", he: "193k", ar: "193k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "848", he: "848", ar: "848" },
            aircraft: { en: "361", he: "361", ar: "361" },
            navy: { en: "60", he: "60", ar: "60" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "yemen",
        coords: [15.5527, 48.5164],
        name: { en: "Yemen", he: "תימן", ar: "اليمن" },
        stats: {
            pop: { en: "33M", he: "33M", ar: "33M" },
            army_regular: { en: "40k", he: "40k", ar: "40k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "30", he: "30", ar: "30" },
            aircraft: { en: "10", he: "10", ar: "10" },
            navy: { en: "30", he: "30", ar: "30" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "syria",
        coords: [34.8021, 38.9968],
        name: { en: "Syria", he: "סוריה", ar: "سوريا" },
        stats: {
            pop: { en: "22M", he: "22M", ar: "22M" },
            army_regular: { en: "100k", he: "100k", ar: "100k" },
            army_reserves: { en: "50k", he: "50k", ar: "50k" },
            tanks: { en: "2,000", he: "2,000", ar: "2,000" },
            aircraft: { en: "450", he: "450", ar: "450" },
            navy: { en: "56", he: "56", ar: "56" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "jordan",
        coords: [30.5852, 36.2384],
        name: { en: "Jordan", he: "ירדן", ar: "الأردن" },
        stats: {
            pop: { en: "11M", he: "11M", ar: "11M" },
            army_regular: { en: "100k", he: "100k", ar: "100k" },
            army_reserves: { en: "65k", he: "65k", ar: "65k" },
            tanks: { en: "1,300", he: "1,300", ar: "1,300" },
            aircraft: { en: "260", he: "260", ar: "260" },
            navy: { en: "27", he: "27", ar: "27" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "uae",
        coords: [23.4241, 53.8478],
        name: { en: "UAE", he: "איחוד האמירויות", ar: "الإمارات" },
        stats: {
            pop: { en: "9M", he: "9M", ar: "9M" },
            army_regular: { en: "65k", he: "65k", ar: "65k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "350", he: "350", ar: "350" },
            aircraft: { en: "538", he: "538", ar: "538" },
            navy: { en: "75", he: "75", ar: "75" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "israel",
        coords: [31.0461, 34.8516],
        name: { en: "Israel", he: "ישראל", ar: "إسرائيل" },
        stats: {
            pop: { en: "9.5M", he: "9.5M", ar: "9.5M" },
            army_regular: { en: "169k", he: "169k", ar: "169k" },
            army_reserves: { en: "465k", he: "465k", ar: "465k" },
            tanks: { en: "2,200", he: "2,200", ar: "2,200" },
            aircraft: { en: "601", he: "601", ar: "601" },
            navy: { en: "67", he: "67", ar: "67" },
            submarines: { en: "5", he: "5", ar: "5" }
        }
    },
    {
        id: "lebanon",
        coords: [33.8547, 35.8623],
        name: { en: "Lebanon", he: "לבנון", ar: "لبنان" },
        stats: {
            pop: { en: "5.5M", he: "5.5M", ar: "5.5M" },
            army_regular: { en: "60k", he: "60k", ar: "60k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "200", he: "200", ar: "200" },
            aircraft: { en: "70", he: "70", ar: "70" },
            navy: { en: "50", he: "50", ar: "50" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "oman",
        coords: [21.4735, 55.9754],
        name: { en: "Oman", he: "עומאן", ar: "عمان" },
        stats: {
            pop: { en: "5M", he: "5M", ar: "5M" },
            army_regular: { en: "42k", he: "42k", ar: "42k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "117", he: "117", ar: "117" },
            aircraft: { en: "128", he: "128", ar: "128" },
            navy: { en: "16", he: "16", ar: "16" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "kuwait",
        coords: [29.3117, 47.4818],
        name: { en: "Kuwait", he: "כווית", ar: "الكويت" },
        stats: {
            pop: { en: "4.3M", he: "4.3M", ar: "4.3M" },
            army_regular: { en: "17k", he: "17k", ar: "17k" },
            army_reserves: { en: "24k", he: "24k", ar: "24k" },
            tanks: { en: "368", he: "368", ar: "368" },
            aircraft: { en: "85", he: "85", ar: "85" },
            navy: { en: "38", he: "38", ar: "38" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "qatar",
        coords: [25.3548, 51.1839],
        name: { en: "Qatar", he: "קטאר", ar: "قطر" },
        stats: {
            pop: { en: "2.7M", he: "2.7M", ar: "2.7M" },
            army_regular: { en: "12k", he: "12k", ar: "12k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "90", he: "90", ar: "90" },
            aircraft: { en: "198", he: "198", ar: "198" },
            navy: { en: "80", he: "80", ar: "80" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    },
    {
        id: "bahrain",
        coords: [26.0667, 50.5577],
        name: { en: "Bahrain", he: "בחריין", ar: "البحرين" },
        stats: {
            pop: { en: "1.5M", he: "1.5M", ar: "1.5M" },
            army_regular: { en: "8k", he: "8k", ar: "8k" },
            army_reserves: { en: "0", he: "0", ar: "0" },
            tanks: { en: "180", he: "180", ar: "180" },
            aircraft: { en: "110", he: "110", ar: "110" },
            navy: { en: "39", he: "39", ar: "39" },
            submarines: { en: "0", he: "0", ar: "0" }
        }
    }
];

const newspaperTranslations = {
    en: {
        header: "The New York Times",
        date: "OCTOBER 7, 2023",
        headline: "ISRAEL UNDER ATTACK",
        subhead: "HAMAS LAUNCHES SURPRISE ASSAULT",
        body: `
            <p>In a sudden and unprecedented escalation, Hamas militants have launched a massive surprise attack on
            Israel from the Gaza Strip. Thousands of rockets have been fired, and ground incursions are reported
            in southern Israeli communities.</p>
            <p>The Israeli government has declared a state of war as the IDF mobilizes reserves to respond to the
            crisis.</p>
        `
    },
    he: {
        header: "ידיעות אחרונות",
        date: "7 באוקטובר 2023",
        headline: "ישראל תחת מתקפה",
        subhead: "חמאס פתח במתקפת פתע",
        body: `
            <p>בהסלמה פתאומית וחסרת תקדים, מחבלי חמאס פתחו במתקפת פתע מסיבית על
            ישראל מרצועת עזה. אלפי רקטות נורו, ודווח על חדירות קרקעיות
            ביישובי הדרום.</p>
            <p>ממשלת ישראל הכריזה על מצב מלחמה בעוד צה"ל מגייס מילואים להגיב ל
            משבר.</p>
        `
    },
    ar: {
        header: "الشرق الأوسط",
        date: "7 أكتوبر 2023",
        headline: "إسرائيل تحت الهجوم",
        subhead: "حماس تشن هجوماً مفاجئاً",
        body: `
            <p>في تصعيد مفاجئ وغير مسبوق، شن مسلحو حماس هجوماً مفاجئاً واسع النطاق على
            إسرائيل من قطاع غزة. تم إطلاق آلاف الصواريخ، وتم الإبلاغ عن توغلات برية
            في المجتمعات الإسرائيلية الجنوبية.</p>
            <p>أعلنت الحكومة الإسرائيلية حالة الحرب بينما يقوم الجيش الإسرائيلي بتعبئة الاحتياطيات للرد على
            الأزمة.</p>
        `
    }
};

module.exports = { countries, newspaperTranslations };
