const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const fs = require('fs')
const { oauth2Client, getAuthUrl } = require('./auth')
const emailTestRouter = require('./routes/email-test')

const TOKENS_PATH = path.join(__dirname, 'tokens.json')

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Load saved tokens on startup so auth persists across server restarts
if (fs.existsSync(TOKENS_PATH)) {
	oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKENS_PATH)))
	console.log('Gmail credentials loaded.')
} else {
	console.log('No tokens found. Visit http://localhost:3001/auth to authenticate Gmail.')
}

// Step 1: redirect user to Google consent screen
app.get('/auth', (req, res) => {
	res.redirect(getAuthUrl())
})

// Step 2: Google redirects back here with a code, exchange it for tokens
app.get('/oauth2callback', async (req, res) => {
	try {
		const code = req.query.code
		const { tokens } = await oauth2Client.getToken(code)
		oauth2Client.setCredentials(tokens)
		fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens))
		res.send('Auth complete. You can close this tab.')
	} catch (err) {
		console.error('[AUTH ERROR]', err)
		res.status(500).send('Auth failed: ' + err.message)
	}
})

app.use('/api', emailTestRouter)

app.listen(3001, () => {
	console.log('Email server running on http://localhost:3001')
})
