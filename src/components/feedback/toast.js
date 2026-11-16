import { toast as sonnerToast } from 'sonner';

/**
 * Unified notification helper backed by Sonner and themed via AppToaster.
 */
export const notify = {
  success: (message, options) => sonnerToast.success(message, options),
  error: (message, options) => sonnerToast.error(message, options),
  info: (message, options) => sonnerToast.info(message, options),
  warning: (message, options) => sonnerToast.warning(message, options),
  loading: (message, options) => sonnerToast.loading(message, options),
  promise: (promise, messages) => sonnerToast.promise(promise, messages),
  dismiss: (id) => sonnerToast.dismiss(id),
};
