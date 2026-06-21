const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');

const templatePath = 'tmp/first-run-live-proof-template.json';

function proofTemplate() {
  return {
    schema: 'first-run-live-proof/v1',
    completedAt: '',
    signupConfirmation: {
      status: 'pending',
      email: '',
      submittedAt: '',
      emailReceivedAt: '',
      confirmedAt: '',
      landedInApp: false,
      evidenceNotes: '',
    },
    passwordRecovery: {
      status: 'pending',
      email: '',
      requestedAt: '',
      emailReceivedAt: '',
      resetCompletedAt: '',
      signedInWithNewPassword: false,
      evidenceNotes: '',
    },
    googleSignIn: {
      status: 'pending',
      account: '',
      oauthCompletedAt: '',
      landedInApp: false,
      evidenceNotes: '',
    },
  };
}

function writeTemplate() {
  mkdirSync('tmp', { recursive: true });
  writeFileSync(templatePath, `${JSON.stringify(proofTemplate(), null, 2)}\n`);
  console.log(`Wrote ${templatePath}`);
}

function requireText(value, path, validationErrors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    validationErrors.push(`${path} is required`);
  }
}

function requireTrue(value, path, validationErrors) {
  if (value !== true) validationErrors.push(`${path} must be true`);
}

function requirePassed(section, path, validationErrors) {
  if (section?.status !== 'pass') validationErrors.push(`${path}.status must be pass`);
}

function validateProof(path) {
  if (!existsSync(path)) throw new Error(`${path} does not exist. Run npm run qa:first-run:proof-template first.`);
  const proof = JSON.parse(readFileSync(path, 'utf8'));
  const validationErrors = [];

  requireText(proof.completedAt, 'completedAt', validationErrors);

  requirePassed(proof.signupConfirmation, 'signupConfirmation', validationErrors);
  requireText(proof.signupConfirmation?.email, 'signupConfirmation.email', validationErrors);
  requireText(proof.signupConfirmation?.submittedAt, 'signupConfirmation.submittedAt', validationErrors);
  requireText(proof.signupConfirmation?.emailReceivedAt, 'signupConfirmation.emailReceivedAt', validationErrors);
  requireText(proof.signupConfirmation?.confirmedAt, 'signupConfirmation.confirmedAt', validationErrors);
  requireTrue(proof.signupConfirmation?.landedInApp, 'signupConfirmation.landedInApp', validationErrors);

  requirePassed(proof.passwordRecovery, 'passwordRecovery', validationErrors);
  requireText(proof.passwordRecovery?.email, 'passwordRecovery.email', validationErrors);
  requireText(proof.passwordRecovery?.requestedAt, 'passwordRecovery.requestedAt', validationErrors);
  requireText(proof.passwordRecovery?.emailReceivedAt, 'passwordRecovery.emailReceivedAt', validationErrors);
  requireText(proof.passwordRecovery?.resetCompletedAt, 'passwordRecovery.resetCompletedAt', validationErrors);
  requireTrue(proof.passwordRecovery?.signedInWithNewPassword, 'passwordRecovery.signedInWithNewPassword', validationErrors);

  requirePassed(proof.googleSignIn, 'googleSignIn', validationErrors);
  requireText(proof.googleSignIn?.account, 'googleSignIn.account', validationErrors);
  requireText(proof.googleSignIn?.oauthCompletedAt, 'googleSignIn.oauthCompletedAt', validationErrors);
  requireTrue(proof.googleSignIn?.landedInApp, 'googleSignIn.landedInApp', validationErrors);

  if (validationErrors.length > 0) {
    console.error(JSON.stringify({ validationErrors }, null, 2));
    process.exit(1);
  }

  console.log(`Validated ${path}`);
}

const [, , command, path] = process.argv;

if (command === '--write-template') {
  writeTemplate();
} else if (command === '--validate') {
  validateProof(path || 'tmp/first-run-live-proof-current.json');
} else {
  console.error('Usage: node scripts/first-run/live-proof.cjs --write-template | --validate <path>');
  process.exit(1);
}
