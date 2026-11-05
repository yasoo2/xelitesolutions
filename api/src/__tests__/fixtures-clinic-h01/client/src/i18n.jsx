import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DICT = {
  en: {
    appName: 'Clinic Manager',
    signIn: 'Sign in',
    signOut: 'Sign out',
    username: 'Username',
    password: 'Password',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    create: 'Create',
    search: 'Search',
    all: 'All',
    actions: 'Actions',
    status: 'Status',
    from: 'From',
    to: 'To',
    loading: 'Loading…',
    none: 'Nothing found.',
    confirmDelete: 'Delete this record? This cannot be undone.',
    loginHint: 'Demo accounts: admin / admin123 · dr.smith / doctor123 · dr.lee / doctor123 · reception / reception123',
    language: 'العربية',
    signedInAs: 'Signed in as',
    readOnly: 'Read-only for your role',
    nav: {
      patients: 'Patients', appointments: 'Appointments', hours: 'Working hours',
      invoices: 'Invoices', reports: 'Revenue report', users: 'Users', audit: 'Audit log',
    },
    roles: { admin: 'Admin', doctor: 'Doctor', receptionist: 'Receptionist' },
    apptStatus: { scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' },
    payStatus: { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid' },
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    patients: {
      title: 'Patients', new: 'New patient', edit: 'Edit patient', firstName: 'First name', lastName: 'Last name',
      phone: 'Phone', email: 'Email', dob: 'Date of birth', notes: 'Notes', name: 'Name',
      searchHint: 'Search by name, phone or email', saved: 'Patient saved.',
    },
    appointments: {
      title: 'Appointments', new: 'New appointment', edit: 'Edit appointment', date: 'Date', doctor: 'Doctor',
      patient: 'Patient', time: 'Time', duration: 'Duration (min)', reason: 'Reason', minutes: 'min',
      allDoctors: 'All doctors', allStatuses: 'All statuses', slot: 'Free time slot', noSlots: 'No free slots on this day.',
      closed: 'The doctor does not work on this day.', book: 'Book appointment', update: 'Update appointment',
      searchHint: 'Search patient name or phone', choose: 'Choose…', hoursOf: 'Working hours',
      saved: 'Appointment saved.', none: 'No appointments for these filters.', chooseDoctor: 'Choose a doctor and a patient.',
    },
    hours: {
      title: 'Working hours', open: 'Open', from: 'From', to: 'To', saveDoctor: 'Save hours',
      saved: 'Working hours saved.', noAccess: 'Only the doctor and the admin can change these hours.',
      specialty: 'Specialty',
    },
    invoices: {
      title: 'Invoices', new: 'New invoice', number: 'Number', description: 'Description', amount: 'Amount',
      paid: 'Paid', balance: 'Balance', issued: 'Issue date', payment: 'Payment', recordPayment: 'Record payment',
      paymentDate: 'Payment date', payments: 'Payments', showPayments: 'Payments', noPayments: 'No payments yet.',
      edit: 'Edit invoice', saved: 'Invoice saved.', paymentSaved: 'Payment recorded.',
      allStatuses: 'All payment statuses', searchHint: 'Search invoice number or patient',
      none: 'No invoices for these filters.', chooseDoctorlessHint: '',
    },
    reports: {
      title: 'Monthly revenue report', year: 'Year', invoiced: 'Invoiced', collected: 'Collected',
      outstanding: 'Outstanding', count: 'Invoices', month: 'Month', chart: 'Invoiced vs collected by month',
      table: 'Monthly breakdown', totals: 'Total',
    },
    users: {
      title: 'Users', new: 'New user', fullName: 'Full name', role: 'Role', specialty: 'Specialty',
      newPassword: 'New password (leave empty to keep)', saved: 'User saved.', created: 'User created.',
    },
    audit: {
      title: 'Audit log', when: 'When', user: 'User', action: 'Action', entity: 'Record', entityId: 'ID',
      details: 'Details', allEntities: 'All records', allActions: 'All actions', searchHint: 'Search user or details',
      changes: 'Changes',
    },
    entities: {
      patient: 'Patient', appointment: 'Appointment', invoice: 'Invoice', user: 'User', session: 'Sign-in',
      doctor_hours: 'Working hours',
    },
      actionNames: {
      create: 'Create', update: 'Update', delete: 'Delete', payment: 'Payment', login: 'Sign-in', logout: 'Sign-out',
    },
    err: {
      invalid_credentials: 'Wrong username or password.',
      forbidden: 'Your role is not allowed to do this.',
      unauthorized: 'Please sign in again.',
      slot_conflict: 'This doctor already has an appointment at that time.',
      patient_conflict: 'This patient already has an appointment at that time.',
      outside_hours: "That time is outside the doctor's working hours.",
      overpayment: 'The payment is larger than the remaining balance.',
      has_records: 'This record is linked to other records and cannot be deleted.',
      duplicate: 'That value already exists.',
      not_found: 'Not found.',
      server: 'Something went wrong on the server.',
    },
  },
  ar: {
    appName: 'إدارة العيادة',
    signIn: 'تسجيل الدخول',
    signOut: 'تسجيل الخروج',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    create: 'إنشاء',
    search: 'بحث',
    all: 'الكل',
    actions: 'إجراءات',
    status: 'الحالة',
    from: 'من',
    to: 'إلى',
    loading: 'جارٍ التحميل…',
    none: 'لا توجد نتائج.',
    confirmDelete: 'هل تريد حذف هذا السجل؟ لا يمكن التراجع عن ذلك.',
    loginHint: 'حسابات تجريبية: admin / admin123 · dr.smith / doctor123 · dr.lee / doctor123 · reception / reception123',
    language: 'English',
    signedInAs: 'مسجّل الدخول باسم',
    readOnly: 'للعرض فقط حسب صلاحيتك',
    nav: {
      patients: 'المرضى', appointments: 'المواعيد', hours: 'ساعات العمل',
      invoices: 'الفواتير', reports: 'تقرير الإيرادات', users: 'المستخدمون', audit: 'سجل التدقيق',
    },
    roles: { admin: 'مدير', doctor: 'طبيب', receptionist: 'موظف استقبال' },
    apptStatus: { scheduled: 'مجدول', completed: 'مكتمل', cancelled: 'ملغى', no_show: 'لم يحضر' },
    payStatus: { unpaid: 'غير مدفوعة', partial: 'مدفوعة جزئياً', paid: 'مدفوعة' },
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    patients: {
      title: 'المرضى', new: 'مريض جديد', edit: 'تعديل المريض', firstName: 'الاسم الأول', lastName: 'اسم العائلة',
      phone: 'الهاتف', email: 'البريد الإلكتروني', dob: 'تاريخ الميلاد', notes: 'ملاحظات', name: 'الاسم',
      searchHint: 'ابحث بالاسم أو الهاتف أو البريد', saved: 'تم حفظ المريض.',
    },
    appointments: {
      title: 'المواعيد', new: 'موعد جديد', edit: 'تعديل الموعد', date: 'التاريخ', doctor: 'الطبيب',
      patient: 'المريض', time: 'الوقت', duration: 'المدة (دقيقة)', reason: 'السبب', minutes: 'دقيقة',
      allDoctors: 'كل الأطباء', allStatuses: 'كل الحالات', slot: 'وقت متاح', noSlots: 'لا توجد أوقات متاحة في هذا اليوم.',
      closed: 'الطبيب لا يعمل في هذا اليوم.', book: 'حجز الموعد', update: 'تحديث الموعد',
      searchHint: 'ابحث باسم المريض أو هاتفه', choose: 'اختر…', hoursOf: 'ساعات العمل',
      saved: 'تم حفظ الموعد.', none: 'لا توجد مواعيد لهذه الفلاتر.', chooseDoctor: 'اختر طبيباً ومريضاً.',
    },
    hours: {
      title: 'ساعات العمل', open: 'يعمل', from: 'من', to: 'إلى', saveDoctor: 'حفظ الساعات',
      saved: 'تم حفظ ساعات العمل.', noAccess: 'فقط الطبيب والمدير يمكنهم تعديل هذه الساعات.',
      specialty: 'التخصص',
    },
    invoices: {
      title: 'الفواتير', new: 'فاتورة جديدة', number: 'الرقم', description: 'الوصف', amount: 'المبلغ',
      paid: 'المدفوع', balance: 'المتبقي', issued: 'تاريخ الإصدار', payment: 'دفعة', recordPayment: 'تسجيل الدفعة',
      paymentDate: 'تاريخ الدفعة', payments: 'الدفعات', showPayments: 'الدفعات', noPayments: 'لا توجد دفعات بعد.',
      edit: 'تعديل الفاتورة', saved: 'تم حفظ الفاتورة.', paymentSaved: 'تم تسجيل الدفعة.',
      allStatuses: 'كل حالات الدفع', searchHint: 'ابحث برقم الفاتورة أو اسم المريض',
      none: 'لا توجد فواتير لهذه الفلاتر.',
    },
    reports: {
      title: 'تقرير الإيرادات الشهري', year: 'السنة', invoiced: 'المفوتر', collected: 'المحصّل',
      outstanding: 'المستحق', count: 'الفواتير', month: 'الشهر', chart: 'المفوتر مقابل المحصّل حسب الشهر',
      table: 'التفصيل الشهري', totals: 'الإجمالي',
    },
    users: {
      title: 'المستخدمون', new: 'مستخدم جديد', fullName: 'الاسم الكامل', role: 'الدور', specialty: 'التخصص',
      newPassword: 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)', saved: 'تم حفظ المستخدم.', created: 'تم إنشاء المستخدم.',
    },
    audit: {
      title: 'سجل التدقيق', when: 'الوقت', user: 'المستخدم', action: 'الإجراء', entity: 'السجل', entityId: 'المعرّف',
      details: 'التفاصيل', allEntities: 'كل السجلات', allActions: 'كل الإجراءات', searchHint: 'ابحث بالمستخدم أو التفاصيل',
      changes: 'التغييرات',
    },
    entities: {
      patient: 'مريض', appointment: 'موعد', invoice: 'فاتورة', user: 'مستخدم', session: 'تسجيل دخول',
      doctor_hours: 'ساعات العمل',
    },
    actionNames: {
      create: 'إنشاء', update: 'تعديل', delete: 'حذف', payment: 'دفعة', login: 'تسجيل دخول', logout: 'تسجيل خروج',
    },
    err: {
      invalid_credentials: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      forbidden: 'دورك لا يسمح بهذا الإجراء.',
      unauthorized: 'يرجى تسجيل الدخول مرة أخرى.',
      slot_conflict: 'لدى هذا الطبيب موعد آخر في هذا الوقت.',
      patient_conflict: 'لدى هذا المريض موعد آخر في هذا الوقت.',
      outside_hours: 'هذا الوقت خارج ساعات عمل الطبيب.',
      overpayment: 'المبلغ المدفوع أكبر من المتبقي.',
      has_records: 'هذا السجل مرتبط بسجلات أخرى ولا يمكن حذفه.',
      duplicate: 'هذه القيمة موجودة بالفعل.',
      not_found: 'غير موجود.',
      server: 'حدث خطأ في الخادم.',
    },
  },
};

const Ctx = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') === 'ar' ? 'ar' : 'en');

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('lang', lang);
  }, [lang]);

  const value = useMemo(() => {
    const dict = DICT[lang];
    const t = (key) => {
      const parts = key.split('.');
      let node = dict;
      for (const p of parts) node = node?.[p];
      if (node === undefined) {
        let fallback = DICT.en;
        for (const p of parts) fallback = fallback?.[p];
        return typeof fallback === 'string' ? fallback : key;
      }
      return node;
    };
    const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
    const money = (cents) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'SAR' }).format((cents || 0) / 100);
    const dateTime = (iso) => new Date(iso).toLocaleString(locale);
    const errorText = (e) => (e?.code && dict.err[e.code]) ? dict.err[e.code] : (e?.message || dict.err.server);
    const monthName = (ym) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${ym}-15T00:00:00`));
    return { lang, setLang, t, locale, money, dateTime, errorText, monthName, dir: lang === 'ar' ? 'rtl' : 'ltr' };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside LangProvider');
  return v;
}
