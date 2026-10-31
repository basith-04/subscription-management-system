# Authentication integration checklist

This checklist records the F01 gate before F02; it is not a claim of complete
end-to-end acceptance. Email verification is deferred.

## Repository and foundation

- [x] Merge `origin/main` into `feat001`, preserving the F01 implementation and
  compatible shared F00 interfaces. Temporary header-based demo authentication
  from main was not retained.
- [x] Verify local PostgreSQL connectivity and inspect the existing `brightloop`
  baseline and role seed without changing its data.
- [ ] Configure secure, environment-provided Admin and Staff seed credentials;
  back up the intended database before changing its contents.
- [ ] Verify a browser, the Docker daemon and Mailpit are available.
- [x] Implement a failure-safe F00 SMTP mailer with isolated transport tests.
- [x] Verify real Mailpit delivery and add F01 permissions and customer scoping.
- [ ] Extend the permission map as business endpoints are implemented; verify
  the database user is least-privileged before deployment.

## F01 checkpoint

- [x] Registration, login, logout and current-user backend and real PostgreSQL
  tests; frontend forms, auth queries and role-guarded shells.
- [x] Require signed JWT expiry, production Secure cookies, and IP-wide as well
  as IP/email credential throttling; reject unsigned and wrong-key JWTs.
- [x] Test backend role middleware for Admin, Staff, Customer and anonymous.
- [x] Test frontend form validation, pending state, duplicate email, role
  redirection, route guards and internal-only return paths.
- [x] Verify the seeded Admin and Staff on the intended development database.
- [x] Verify the browser walkthrough below at 360, 768 and 1280 pixels on host.
- [ ] Verify frontend/API cookie and CORS behavior through the intended Docker
  topology, and check browser back-navigation after logout.
- [ ] Resolve the additional outstanding security and environment findings
  documented in the final report. Stateless JWT logout cannot revoke a copied
  token under D-04 and requires a separately approved architectural decision.

### Manual F01 walkthrough (pending)

Using a dedicated development database and environment-provided seed
credentials, start the backend and frontend, then in a browser:

1. Register a new customer at `/register`; check password guidance and duplicate
   email feedback. Confirm the portal opens and `/auth/me` reports the customer.
2. Sign out, use browser Back, and confirm private content is not accessible.
   Sign in again and confirm the portal opens.
3. Visit `/app` as a customer and confirm access is denied. Test protected
   backend routes directly when those routes exist.
4. Sign in as the seeded Admin and Staff and confirm each reaches `/app`.
5. Repeat the forms at 360, 768 and 1280 pixels and check keyboard access.
6. Verify credentials, CORS, cookie flags and rate-limit feedback using the
   intended deployment origins. Never record secrets or cookies in reports.

## F02 and deployment (not started: F01 gate pending)

- [ ] Add the password-reset migration, token lifecycle, mailer, endpoints and
  UI; test concurrency, expiry, enumeration and mail failures.
- [ ] Back up and migrate the intended PostgreSQL database non-destructively.
- [ ] Configure host PostgreSQL as the primary Docker mode, optional isolated
  Compose PostgreSQL, and Mailpit; run the complete Docker acceptance sequence.
- [ ] Complete the security review, documentation and final acceptance report.
