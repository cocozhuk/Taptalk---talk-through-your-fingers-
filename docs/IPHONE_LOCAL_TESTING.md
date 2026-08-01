# Local iPhone testing

An iPhone needs a trusted HTTPS origin before Safari will grant camera access.
TapTalk therefore has a separate, opt-in test command that binds to the Mac's
local network. The normal `npm run dev` command remains HTTP-only on
`127.0.0.1`.

Use this only on a trusted private Wi-Fi network. It does not expose TapTalk to
the internet unless the router or Mac has separately been configured to do so.

## One-time trust setup

1. Install [mkcert](https://github.com/FiloSottile/mkcert) and its local root:

   ```sh
   brew install mkcert
   mkcert -install
   ```

2. Find the Mac's Wi-Fi address. `en0` is typical; use the active interface if
   the command returns nothing:

   ```sh
   ipconfig getifaddr en0
   ```

3. Put the development certificate in the ignored `.local-certs` directory,
   replacing `192.168.1.23` with that address:

   ```sh
   mkdir -p .local-certs
   mkcert -cert-file .local-certs/iphone-cert.pem -key-file .local-certs/iphone-key.pem 192.168.1.23 localhost 127.0.0.1 ::1
   ```

4. Run `mkcert -CAROOT`, transfer only `rootCA.pem` from that directory to the
   test iPhone, and install the profile. Then enable it under **Settings →
   General → About → Certificate Trust Settings**. Never transfer or share
   `rootCA-key.pem`.

## Start a test session

Keep the Mac and iPhone on the same trusted Wi-Fi network, then run:

```sh
npm run dev:iphone -- --cert .local-certs/iphone-cert.pem --key .local-certs/iphone-key.pem
```

On the iPhone, open `https://<mac-wifi-address>:4173` in Safari. The certificate
must include the exact address used in the URL. If the Mac's Wi-Fi address
changes, generate a new certificate with the new address.

The command requires explicit certificate and private-key paths and binds to
`0.0.0.0` only for that process. Stop it with **Control-C** immediately after
testing. Do not commit certificates or keys; `.local-certs/` is ignored.
