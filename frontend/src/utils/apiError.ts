type ApiErrorBody = {
  message?: string;
  error?: string;
  messages?: string | { error?: string | string[]; [key: string]: unknown };
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: ApiErrorBody }; message?: string; code?: string };
  const data = err?.response?.data;

  if (!data) {
    if (err?.code === 'ERR_NETWORK') {
      return 'Cannot reach the server. Please check your connection or try again later.';
    }
    if (typeof err?.message === 'string' && err.message.trim()) {
      return err.message;
    }
    return fallback;
  }

  // Backend returns plain `error` key (portal controller, etc.)
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }

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
