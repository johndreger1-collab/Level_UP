// Fill in these two values, then publish the web folder. Neither value is a secret:
//  - the OAuth client ID is public by design (the server separately checks that tokens were issued for it)
//  - the API URL is the Apps Script web app "/exec" address; all security is enforced by the server, not by hiding this URL
window.LEVEL_UP_CONFIG = {
  GOOGLE_CLIENT_ID: 'PASTE_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_ENDING_IN_/exec'
};
