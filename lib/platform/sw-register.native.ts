// Service workers do not exist on native platforms.
export async function registerAppServiceWorker(): Promise<null> {
  return null;
}
