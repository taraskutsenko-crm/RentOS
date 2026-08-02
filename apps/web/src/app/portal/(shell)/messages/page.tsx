"use client";

import { Button, Card, CardContent } from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { usePortalMessages, useSendPortalMessage } from "../../../../hooks/use-portal-messages";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

export default function PortalMessagesPage() {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: messages, isLoading } = usePortalMessages();
  const sendMessage = useSendPortalMessage();

  async function handleSend(): Promise<void> {
    if (!body.trim()) return;
    setError(null);
    try {
      await sendMessage.mutateAsync({ body });
      setBody("");
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("portal.messages.title")}</h1>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          {isLoading && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}
          {!isLoading && (!messages || messages.length === 0) && (
            <p className="text-muted-foreground text-sm">{t("portal.messages.empty")}</p>
          )}
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {messages?.map((message) => (
              <div
                key={message.id}
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  message.senderType === "CUSTOMER"
                    ? "bg-primary text-primary-foreground self-end"
                    : "bg-secondary text-secondary-foreground self-start"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(message.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-2">
            <textarea
              className="border-input flex-1 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
              rows={2}
              placeholder={t("portal.messages.placeholder")}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <Button
              onClick={() => void handleSend()}
              disabled={!body.trim() || sendMessage.isPending}
              className="self-end"
            >
              {sendMessage.isPending ? t("portal.messages.sending") : t("portal.messages.send")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
