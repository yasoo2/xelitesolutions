import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      login: 'Login',
      toggleTheme: 'Toggle Theme',
      homeSubtitle: 'A simple entry to the World of JOE',
      email: 'Email',
      password: 'Password',
      register: 'Register',
      welcomeTitle: '👋',
      welcomeMsg: 'Hello! I am Joe, your smart assistant.\nHow can I help you today?',
      inputPlaceholder: 'Enter your command here...',
      send: 'Send',
      connecting: 'Connecting...',
      connected: 'Connected',
      copy: 'Copy text',
      working: 'Working...',
      planProposed: '📋 Proposed Plan',
      planAction: 'I will',
      inputs: 'Inputs',
      outputs: 'Outputs',
      approvalRequired: 'Approval Required',
      risk: 'Risk',
      action: 'Action',
      deny: 'Deny',
      approve: 'Approve',
      tools: {
        file_write: 'Create File',
        file_read: 'Read File',
        ls: 'List Files',
        web_search: 'Web Search',
        shell_execute: 'Execute Command',
        http_fetch: 'Fetch URL',
        file_edit: 'Edit File',
        plan: 'Plan & Analyze',
        summarize: 'Summarize',
        unknown: 'Unknown Tool'
      },
      artifacts: {
        image: 'Image',
        video: 'Video',
        file: 'File',
        openNewWindow: 'Open in new window'
      },
      error: 'Error sending command'
    }
  },
  ar: {
    translation: {
      login: 'تسجيل الدخول',
      toggleTheme: 'تبديل السمة',
      homeSubtitle: 'بوابة الدخول إلى عالم جو',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      register: 'تسجيل',
      welcomeTitle: '👋',
      welcomeMsg: 'مرحباً! أنا جو، مساعدك الذكي.\nكيف يمكنني مساعدتك اليوم؟',
      inputPlaceholder: 'أدخل أمرك هنا...',
      send: 'إرسال',
      connecting: 'جاري الاتصال...',
      connected: 'متصل',
      copy: 'نسخ النص',
      working: 'جاري العمل...',
      planProposed: '📋 الخطة المقترحة',
      planAction: 'سأقوم بـ',
      inputs: 'المدخلات',
      outputs: 'المخرجات',
      approvalRequired: 'موافقة مطلوبة',
      risk: 'مستوى الخطورة',
      action: 'الإجراء',
      deny: 'رفض',
      approve: 'موافقة',
      tools: {
        file_write: 'إنشاء ملف',
        file_read: 'قراءة ملف',
        ls: 'عرض الملفات',
        web_search: 'بحث في الويب',
        shell_execute: 'تنفيذ أمر النظام',
        http_fetch: 'جلب رابط',
        file_edit: 'تعديل ملف',
        plan: 'تحليل وتخطيط',
        summarize: 'تلخيص النتائج',
        unknown: 'أداة غير معروفة'
      },
      artifacts: {
        image: 'صورة',
        video: 'فيديو',
        file: 'ملف',
        openNewWindow: 'فتح في نافذة جديدة'
      },
      error: 'فشل إرسال الأمر'
    }
  },
  fr: {
    translation: {
      login: 'Connexion',
      toggleTheme: 'Changer de thème',
      homeSubtitle: 'Une entrée simple dans le monde de JOE',
      email: 'Email',
      password: 'Mot de passe',
      register: 'S\'inscrire',
      welcomeTitle: '👋',
      welcomeMsg: 'Bonjour ! Je suis Joe, votre assistant intelligent.\nComment puis-je vous aider aujourd\'hui ?',
      inputPlaceholder: 'Entrez votre commande ici...',
      send: 'Envoyer',
      connecting: 'Connexion...',
      connected: 'Connecté',
      copy: 'Copier le texte',
      working: 'En cours...',
      planProposed: '📋 Plan Proposé',
      planAction: 'Je vais',
      inputs: 'Entrées',
      outputs: 'Sorties',
      approvalRequired: 'Approbation requise',
      risk: 'Risque',
      action: 'Action',
      deny: 'Refuser',
      approve: 'Approuver',
      tools: {
        file_write: 'Créer un fichier',
        file_read: 'Lire un fichier',
        ls: 'Lister les fichiers',
        web_search: 'Recherche Web',
        shell_execute: 'Exécuter la commande',
        http_fetch: 'Récupérer URL',
        file_edit: 'Modifier le fichier',
        plan: 'Planifier & Analyser',
        summarize: 'Résumer',
        unknown: 'Outil inconnu'
      },
      artifacts: {
        image: 'Image',
        video: 'Vidéo',
        file: 'Fichier',
        openNewWindow: 'Ouvrir dans une nouvelle fenêtre'
      },
      error: 'Erreur lors de l\'envoi'
    }
  },
  de: {
    translation: {
      login: 'Anmelden',
      toggleTheme: 'Thema umschalten',
      homeSubtitle: 'Ein einfacher Zugang zur Welt von JOE',
      email: 'E-Mail',
      password: 'Passwort',
      register: 'Registrieren',
      welcomeTitle: '👋',
      welcomeMsg: 'Hallo! Ich bin Joe, dein intelligenter Assistent.\nWie kann ich dir heute helfen?',
      inputPlaceholder: 'Gib deinen Befehl hier ein...',
      send: 'Senden',
      connecting: 'Verbinden...',
      connected: 'Verbunden',
      copy: 'Text kopieren',
      working: 'Arbeite...',
      planProposed: '📋 Vorgeschlagener Plan',
      planAction: 'Ich werde',
      inputs: 'Eingaben',
      outputs: 'Ausgaben',
      approvalRequired: 'Genehmigung erforderlich',
      risk: 'Risiko',
      action: 'Aktion',
      deny: 'Ablehnen',
      approve: 'Genehmigen',
      tools: {
        file_write: 'Datei erstellen',
        file_read: 'Datei lesen',
        ls: 'Dateien auflisten',
        web_search: 'Websuche',
        shell_execute: 'Befehl ausführen',
        http_fetch: 'URL abrufen',
        file_edit: 'Datei bearbeiten',
        plan: 'Planen & Analysieren',
        summarize: 'Zusammenfassen',
        unknown: 'Unbekanntes Werkzeug'
      },
      artifacts: {
        image: 'Bild',
        video: 'Video',
        file: 'Datei',
        openNewWindow: 'In neuem Fenster öffnen'
      },
      error: 'Fehler beim Senden'
    }
  },
  ru: {
    translation: {
      login: 'Войти',
      toggleTheme: 'Сменить тему',
      homeSubtitle: 'Простой вход в мир JOE',
      email: 'Email',
      password: 'Пароль',
      register: 'Регистрация',
      welcomeTitle: '👋',
      welcomeMsg: 'Привет! Я Джо, твой умный помощник.\nЧем я могу помочь сегодня?',
      inputPlaceholder: 'Введите команду здесь...',
      send: 'Отправить',
      connecting: 'Подключение...',
      connected: 'Подключено',
      copy: 'Копировать',
      working: 'Работаю...',
      planProposed: '📋 Предложенный план',
      planAction: 'Я сделаю',
      inputs: 'Входные данные',
      outputs: 'Выходные данные',
      approvalRequired: 'Требуется подтверждение',
      risk: 'Риск',
      action: 'Действие',
      deny: 'Отклонить',
      approve: 'Принять',
      tools: {
        file_write: 'Создать файл',
        file_read: 'Читать файл',
        ls: 'Список файлов',
        web_search: 'Поиск в веб',
        shell_execute: 'Выполнить команду',
        http_fetch: 'Получить URL',
        file_edit: 'Редактировать файл',
        plan: 'Планирование',
        summarize: 'Обобщить',
        unknown: 'Неизвестный инструмент'
      },
      artifacts: {
        image: 'Изображение',
        video: 'Видео',
        file: 'Файл',
        openNewWindow: 'Открыть в новом окне'
      },
      error: 'Ошибка отправки'
    }
  },
  es: {
    translation: {
      login: 'Iniciar sesión',
      toggleTheme: 'Cambiar tema',
      homeSubtitle: 'Una entrada simple al mundo de JOE',
      email: 'Correo electrónico',
      password: 'Contraseña',
      register: 'Registrarse',
      welcomeTitle: '👋',
      welcomeMsg: '¡Hola! Soy Joe, tu asistente inteligente.\n¿Cómo puedo ayudarte hoy?',
      inputPlaceholder: 'Ingresa tu comando aquí...',
      send: 'Enviar',
      connecting: 'Conectando...',
      connected: 'Conectado',
      copy: 'Copiar texto',
      working: 'Trabajando...',
      planProposed: '📋 Plan Propuesto',
      planAction: 'Voy a',
      inputs: 'Entradas',
      outputs: 'Salidas',
      approvalRequired: 'Aprobación requerida',
      risk: 'Riesgo',
      action: 'Acción',
      deny: 'Rechazar',
      approve: 'Aprobar',
      tools: {
        file_write: 'Crear archivo',
        file_read: 'Leer archivo',
        ls: 'Listar archivos',
        web_search: 'Búsqueda web',
        shell_execute: 'Ejecutar comando',
        http_fetch: 'Obtener URL',
        file_edit: 'Editar archivo',
        plan: 'Planificar y Analizar',
        summarize: 'Resumir',
        unknown: 'Herramienta desconocida'
      },
      artifacts: {
        image: 'Imagen',
        video: 'Video',
        file: 'Archivo',
        openNewWindow: 'Abrir en nueva ventana'
      },
      error: 'Error al enviar'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('lang') || 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false }
  });

export default i18n;
