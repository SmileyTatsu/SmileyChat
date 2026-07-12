# How to Access SmileyChat Remotely

By default, SmileyChat blocks all connections from outside your own computer to protect your data. If you want to use SmileyChat on your phone, a tablet, or another PC on your network, you need to grant access.

Here is the step-by-step guide to setting up remote access.

## Step 1: Open the `.env` file

Go to the main SmileyChat folder. Look for a file named `.env`.
_(If it doesn't exist, start the app once to create it, or copy/rename `.env.example` to `.env`)_.

## Step 2: Choose your security method

Open the `.env` file in a text editor (like Notepad) and add **one** of the following configurations:

### Option A: Username and Password (Recommended)

This requires a login when you access from another device.

```env
SMILEYCHAT_BASIC_AUTH_USER=YourUsername
SMILEYCHAT_BASIC_AUTH_PASS=YourSecretPassword
```

### Option B: Trust your entire WiFi network

If you trust everyone on your home network and don't want to enter passwords:

```env
SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=true
```

### Option C: IP Allowlist

If you only want to allow specific devices by their exact IP addresses:

```env
SMILEYCHAT_IP_ALLOWLIST=192.168.1.5,192.168.1.10
```

## Step 3: Save the file (No restart needed!)

SmileyChat hot-reloads its `.env` file automatically. Just save the file, and within 2 seconds, your new security settings will be active. No need to restart the console.

## Step 4: Find your computer's local IP address

- **Windows:** Open Command Prompt (`cmd`) and type `ipconfig`. Look for the "IPv4 Address" (usually starts with `192.168.` or `10.0.`).
- **Mac/Linux:** Open the terminal and type `ifconfig` or `ip a`.

## Step 5: Connect from your Mobile Device

Open the browser on your phone or tablet (ensure it's connected to the same WiFi as your computer). Type your computer's IP address followed by the port `:4173`.
_Example:_ `http://192.168.1.15:4173`

If you chose Option A, your browser will prompt you for the username and password you set in the `.env` file.

### How connection keys work on a phone

When you chat from another device, SmileyChat keeps your provider API keys on
the computer that runs SmileyChat. Your phone sends its compiled chat request
to that computer, and the computer calls the selected provider and streams the
answer back. Connection profile names and models remain visible on the phone,
but stored API keys are intentionally never sent to it.

For this reason, the Connections screen on a remote device may show a notice
that keys are protected locally. You can load the saved profile's model catalog
and test it from your phone; SmileyChat performs both requests on the computer
that holds the key. Add, replace, or remove provider keys only on that computer.

**Tip for Mobile Users:** Once the page loads, you can use your browser's **"Add to Home Screen"** feature. This will install SmileyChat as a Web App (PWA) on your device, giving you a full-screen, native app-like experience without the browser address bar.

---

## Connecting from Outside Your Home (Over the Internet)

If you want to use SmileyChat on mobile data (4G/5G) or from a completely different location, simply using your local network IP address won't work. You need a way to expose your local server to the wider internet securely.

While you _could_ use Port Forwarding on your router, this is generally considered unsafe as it exposes your home network directly to attackers. Instead, we highly recommend using a secure tunnel.

### Option 1: Cloudflare Tunnels (Recommended for Domain Owners)

**Why use a Cloudflare Tunnel?**
Cloudflare Tunnels (`cloudflared`) create a secure, outbound connection from your computer to Cloudflare's network. This means:

- You don't need to open any ports on your home router (no port forwarding).
- Your true home IP address remains hidden from the public internet.
- You can attach your SmileyChat instance to a custom domain name (e.g., `chat.yourdomain.com`).
- You get automatic HTTPS/SSL encryption for your connection.

**What you need:**

- A Cloudflare account (free).
- A domain name managed by Cloudflare.

**Basic Setup Steps:**

1. Log in to your Cloudflare Zero Trust dashboard.
2. Navigate to **Networks > Tunnels** and create a new tunnel.
3. Install the `cloudflared` connector on the same computer running SmileyChat, following the dashboard instructions.
4. Route a Public Hostname (like `chat.yourdomain.com`) to your local SmileyChat address: `http://localhost:4173`.
5. **Important Security Note:** Because the tunnel makes your app accessible to anyone on the internet who knows the URL, you **must** use Option A (Username and Password) from Step 2 above, or configure Cloudflare Access (Zero Trust Access policies) to enforce an email/social login before anyone can even load the page.

### Option 2: Cloudflare Quick Tunnels (Fastest, No Account Needed)

If you don't have a domain name or Cloudflare account but want to test remote access quickly over the internet, you can use a **Quick Tunnel** (TryCloudflare). This generates a random, temporary URL that routes to your local machine.

**Basic Setup Steps:**

1. Download the [`cloudflared` command line tool](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Open your terminal or command prompt.
3. Run the following command:
    ```bash
    cloudflared tunnel --url http://localhost:4173
    ```
4. Look at the terminal output. It will provide a random URL (e.g., `https://random-words.trycloudflare.com`). You can open this link on your phone from anywhere.

**Important Considerations:**

- **Security:** This URL is public. You **must** enable Option A (Username and Password) from Step 2 above in your `.env` file before starting the tunnel to protect your data.
- **Temporary:** The URL changes every time you restart the command. It's excellent for temporary, quick access but not for permanent setups.

### Option 3: Tailscale (Easiest for Permanent Personal Use)

If you use [Tailscale](https://tailscale.com/), SmileyChat detects it automatically. Tailscale connects your devices into a secure, private Virtual Private Network (VPN) using WireGuard.

- You don't need a domain name.
- Only devices logged into your Tailscale account can access the app.
- Just install Tailscale on your PC and your phone.
- Use your PC's Tailscale IP (e.g., `http://100.x.x.x:4173`) from your phone after configuring Basic Auth or a Tailscale IP allowlist. You can set `SMILEYCHAT_BYPASS_AUTH_TAILSCALE=true` to skip both controls, but only do that when every Tailnet peer is trusted to read chats and connection secrets.
