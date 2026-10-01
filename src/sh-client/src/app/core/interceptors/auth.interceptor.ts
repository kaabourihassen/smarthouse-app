import { HttpInterceptorFn } from '@angular/common/http';

/** Ensures every request to our API carries the httpOnly session cookie. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};
