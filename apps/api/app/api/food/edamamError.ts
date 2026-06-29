export class EdamamProviderError extends Error {
  status: number;
  upstreamStatus: number;
  provider: string;
  details?: string;

  constructor(
    message: string,
    options: {
      details?: string;
      provider?: string;
      status?: number;
      upstreamStatus: number;
    },
  ) {
    super(message);
    this.name = "EdamamProviderError";
    this.status = options.status ?? 502;
    this.upstreamStatus = options.upstreamStatus;
    this.provider = options.provider ?? "edamam";
    this.details = options.details;
  }
}

export async function createEdamamProviderError(
  response: Response,
  action: string,
): Promise<EdamamProviderError> {
  const details = await readProviderErrorText(response);
  const upstreamStatus = response.status;

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return new EdamamProviderError(
      `Edamam authentication failed during ${action}`,
      {
        details,
        upstreamStatus,
      },
    );
  }

  if (upstreamStatus === 429) {
    return new EdamamProviderError(`Edamam rate limit exceeded during ${action}`, {
      details,
      upstreamStatus,
    });
  }

  return new EdamamProviderError(`Edamam request failed during ${action}`, {
    details,
    upstreamStatus,
  });
}

async function readProviderErrorText(response: Response): Promise<string | undefined> {
  try {
    const text = (await response.text()).trim();
    return text ? text.slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}
