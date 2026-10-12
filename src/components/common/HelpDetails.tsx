import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
/** Explanations stay available without occupying the working view by default. */
export function HelpDetails({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    return <details className="text-xs text-gray-400"><summary className="cursor-pointer min-h-11 content-center">{t('common.help', 'Help')}</summary><div className="space-y-2 pb-2">{children}</div></details>;
}
