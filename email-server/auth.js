const { google } = require('googleapis')

const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	'http://localhost:3001/oauth2callback'
)

function getAuthUrl() {
	return oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: ['https://www.googleapis.com/auth/gmail.send']
	})
}

module.exports = { oauth2Client, getAuthUrl }
