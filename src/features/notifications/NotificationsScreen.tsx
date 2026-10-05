"use client";

import { Page, PageHeader } from "@/components/layout/PageHeader";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { ButtonLink } from "@/components/ui/primitives";

export function NotificationsScreen() {
  return (
    <Page narrow>
      <PageHeader
        title="التنبيهات"
        description="تذكيرات لطيفة بوردك ومراجعاتك، وأخبار تقدّمك."
        actions={
          <ButtonLink href="/settings#reminders" variant="ghost" size="sm" icon="settings">
            ضبط التذكيرات
          </ButtonLink>
        }
      />
      <NotificationPanel />
    </Page>
  );
}
