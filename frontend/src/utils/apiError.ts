type ApiErrorBody = {
  message?: string;
  messages?: string | { error?: string | string[]; [key: string]: unknown };
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: ApiErrorBody } })?.response?.data;
  if (!data) return fallback;

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }

  const { messages } = data;
  if (!messages) return fallback;

  if (typeof messages === 'string' && messages.trim()) {
    return messages;
  }

  if (typeof messages === 'object') {
    const directError = messages.error;
    if (typeof directError === 'string' && directError.trim()) {
      return directError;
    }
    if (Array.isArray(directError) && directError.length > 0) {
      return directError.map(String).join(', ');
    }

    const fieldMessages = Object.values(messages)
      .flat()
      .map(String)
      .filter(Boolean);

    if (fieldMessages.length > 0) {
      return fieldMessages.join(', ');
    }
  }

  return fallback;
}
