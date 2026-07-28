/**
 * Password policy constants.
 *
 * Separate from `password.ts` so the client can state the rule without pulling
 * the hashing implementation into the browser bundle. The form has to show the
 * minimum length, and importing it from the module that also does PBKDF2 would
 * ship the whole thing to every visitor — and put a server-shaped module one
 * careless import away from client code.
 *
 * The server still validates. This is the copy the UI is allowed to know.
 */

/**
 * Minimum length, and deliberately no composition rules.
 *
 * NIST SP 800-63B is explicit that "must contain a digit and a symbol" rules
 * make passwords worse, not better — they push people towards `Password1!`.
 * Length is what actually correlates with strength.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Upper bound. Not a security requirement — a guard against someone posting a
 * 10 MB body and making us run PBKDF2 over it.
 */
export const PASSWORD_MAX_LENGTH = 200;
