function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateEmailKey(email) {
  return `${email.to}-${email.subject}-${email.body}`;
}
