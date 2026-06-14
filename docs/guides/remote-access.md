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

## Step 5: Connect from your phone

Open the browser on your phone (ensure it's connected to the same WiFi as your computer). Type your computer's IP address followed by the port `:4173`.
_Example:_ `http://192.168.1.15:4173`

If you chose Option A, your browser will prompt you for the username and password you set in the `.env` file.

---

### A note about Tailscale

If you use [Tailscale](https://tailscale.com/), SmileyChat detects it automatically. Tailscale connections bypass the password requirement because they are already authenticated by your Tailnet. Just use your PC's Tailscale IP (e.g., `http://100.x.x.x:4173`) from your phone, and it will just work!
