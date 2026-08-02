"use client";

import { Button, Card, CardContent } from "@rentos/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import {
  useMarkAllPortalNotificationsRead,
  useMarkPortalNotificationRead,
  usePortalNotifications,
} from "../../../../hooks/use-portal-notifications";

export default function PortalNotificationsPage() {
  const { t } = useTranslation();
  const { data: notifications, isLoading } = usePortalNotifications();
  const markRead = useMarkPortalNotificationRead();
  const markAllRead = useMarkAllPortalNotificationsRead();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("portal.notifications.title")}</h1>
        {(notifications?.some((n) => !n.readAt) ?? false) && (
          <Button variant="outline" size="sm" onClick={() => void markAllRead.mutateAsync()}>
            {t("portal.notifications.markAllRead")}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="text-muted-foreground p-6 text-sm">{t("common.loading")}</p>}
          {!isLoading && (!notifications || notifications.length === 0) && (
            <p className="text-muted-foreground p-6 text-sm">{t("portal.notifications.empty")}</p>
          )}
          {!isLoading && notifications && notifications.length > 0 && (
            <ul className="divide-y">
              {notifications.map((notification) => {
                const content = (
                  <div
                    className={`flex items-start justify-between gap-4 p-4 text-sm ${
                      notification.readAt ? "" : "bg-accent/40"
                    }`}
                  >
                    <div>
                      <p className="font-medium">{notification.title}</p>
                      <p className="text-muted-foreground">{notification.body}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t(`portal.notifications.types.${notification.type}`)} ·{" "}
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!notification.readAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.preventDefault();
                          void markRead.mutateAsync(notification.id);
                        }}
                      >
                        ✓
                      </Button>
                    )}
                  </div>
                );
                return (
                  <li key={notification.id}>
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          if (!notification.readAt) {
                            void markRead.mutateAsync(notification.id);
                          }
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
