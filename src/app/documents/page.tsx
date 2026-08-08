'use client';

import { AppShell } from '@/components/layout/AppShell';

export default function DocumentsPage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-bold">المستندات</h1>

      <div className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-2 font-bold">المستندات المُصدَّرة (PDF / Word / Excel)</h2>
          <p className="text-sm text-gray-600">
            لا يحتوي هذا التطبيق على أرشيف مركزي لكل المستندات المُصدَّرة. عند تصدير أي مستند (مثل إيصال تبرع أو
            كشف مساعدة) من صفحة السجل الخاص به، يتم إنشاء الملف وحفظه مباشرة في مجلد Documents الخاص بالتطبيق على
            جهازك. للوصول إلى مستند معين، افتحه من زر التصدير الموجود في صفحة السجل نفسه.
          </p>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-bold">المرفقات (صور المستندات الرسمية)</h2>
          <p className="text-sm text-gray-600">
            المرفقات التي يتم رفعها لسجل معين (مثل صورة هوية أو تقرير طبي) تُحفظ في مجلد Attachments الخاص
            بالتطبيق، ويمكن الاطلاع عليها أو إضافة مرفقات جديدة من داخل صفحة تفاصيل السجل نفسه (الأسرة، المستفيد،
            المساعدة... إلخ) ضمن قسم المرفقات.
          </p>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-bold">نسخ احتياطية من المستندات والمرفقات</h2>
          <p className="text-sm text-gray-600">
            عند إنشاء نسخة احتياطية من صفحة{' '}
            <span className="font-medium">النسخ الاحتياطي</span>، يتم تضمين مجلدي Documents و Attachments كاملين
            ضمن ملف النسخة الاحتياطية، بحيث لا تُفقد أي مستندات أو مرفقات عند الاستعادة لاحقاً.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
