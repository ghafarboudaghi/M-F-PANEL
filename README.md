# M&F Panel

**A Cloudflare Workers-based proxy management panel with user subscriptions, traffic accounting, and multi-protocol WebSocket relay.**

**پنل مدیریت پروکسی مبتنی بر Cloudflare Workers** با قابلیت مدیریت کاربران، ساخت لینک اشتراک، محاسبه مصرف ترافیک و پشتیبانی از چند پروتکل.

---

## 🌐 Language / زبان

- [English](#english)
- [فارسی](#فارسی)

---

# English

## Overview

M&F Panel is a serverless proxy management application designed to run on **Cloudflare Workers**. It provides an administration interface for managing users and connection endpoints, generating client subscription links, tracking traffic usage, and exporting or restoring panel data.

The application is implemented in a single `worker.js` file and uses **Cloudflare Workers KV** for persistent storage.

## Features

### User Management
- Create users with automatically generated UUIDs.
- Set an optional account expiration period.
- Set an optional traffic quota (GB).
- Enable or disable accounts.
- Delete existing users.
- View user subscription information.

### Supported Protocols
The subscription generator can produce connection links for:

- VLESS over WebSocket + TLS
- VMess over WebSocket + TLS
- Shadowsocks (AES-128-GCM) over WebSocket + TLS
- Trojan over WebSocket + TLS

### Subscription Page
Each user receives a subscription URL that can:
- Return Base64-encoded configuration links for client applications.
- Display a web-based subscription page when opened in a browser.
- Show account status, expiration, traffic usage, and remaining quota.
- Display a QR code and provide configuration links for copying.

### Traffic & Usage
- Track uploaded and downloaded traffic.
- Store daily usage records in KV.
- Enforce configured traffic quotas.
- Display usage information on the subscription page.

### Endpoint Management
- Add and remove external connection endpoints.
- Configure endpoint tags, addresses, ports, and optional fallback proxy IPs.
- Supported TLS ports: `443`, `2053`, `2083`, `2087`, `2096`, `8443`.

### Backup & Restore
- Export user and endpoint data as a JSON backup.
- Restore data from a previously exported backup.
- Clear stored traffic statistics.

### Additional Features
- Cloudflare clean-IP candidate retrieval.
- Optional global fallback proxy IP.
- Cached user, endpoint, and usage data to reduce repeated KV reads.
- Responsive web interfaces.

## Requirements

- A Cloudflare account with Workers enabled.
- A Cloudflare Workers KV namespace.
- A deployment method:
  - Cloudflare Dashboard, or
  - Wrangler CLI.

The Worker uses Cloudflare-specific APIs, including `cloudflare:sockets`, `WebSocketPair`, and the Workers runtime. It is not a standard Node.js application and cannot be run directly with `node worker.js`.

## Installation & Deployment

### 1. Create a KV Namespace

In the Cloudflare Dashboard:

1. Open **Workers & Pages**.
2. Open **KV**.
3. Create a namespace, for example `MF_PANEL_DB`.
4. Keep the namespace available for the Worker binding.

### 2. Add the Worker

1. Open **Workers & Pages**.
2. Create a Worker.
3. Open its code editor.
4. Replace the sample code with the contents of `worker.js`.
5. Save and deploy the Worker.

### 3. Configure the KV Binding

In the Worker settings, open **Bindings** and add a **KV Namespace** binding:

| Setting | Value |
|---|---|
| Variable name | `DB` |
| KV namespace | `MF_PANEL_DB` (or your namespace name) |

The binding name must be exactly `DB`, because the Worker accesses storage through `env.DB`.

### 4. Configure Environment Variables

Add the following variables in the Worker settings.

| Variable | Required | Description |
|---|---:|---|
| `ADMIN_PASS` | Yes | Administrator password. |
| `ADMIN_USER` | No | Administrator username. Defaults to `admin`. |
| `SECRET_PATH` | No | Optional private URL prefix for the panel and subscriptions. |
| `PROXYIP` | No | Optional global fallback proxy IP/host. |

**Important:** `ADMIN_PASS` must be configured. The panel and API also require the `DB` KV binding.

For better security, store `ADMIN_PASS` as a **secret**, not as a plain-text variable.

### 5. Open the Panel

After deployment, open:

```text
https://YOUR-WORKER-DOMAIN/SECRET_PATH/panel
```

If `SECRET_PATH` is not configured:

```text
https://YOUR-WORKER-DOMAIN/panel
```

Log in using your configured administrator credentials.

## Configuration Notes

### SECRET_PATH

`SECRET_PATH` is optional. It adds a URL prefix to the administration panel, API, and subscription routes.

For example, if:

```text
SECRET_PATH=my-private-path
```

The panel URL becomes:

```text
https://YOUR-WORKER-DOMAIN/my-private-path/panel
```

The value is normalized by the Worker; do not include leading or trailing slashes.

This is an additional URL obscurity measure, **not a replacement for authentication**.

### PROXYIP

`PROXYIP` is an optional global fallback host/IP used by the relay when a direct connection attempt fails. An endpoint-specific `proxyip` value takes precedence over this global value.

### Endpoint Ports

The panel accepts the following TLS ports for configured endpoints:

```text
443, 2053, 2083, 2087, 2096, 8443
```

## API Reference

All administration API routes use the optional `SECRET_PATH` prefix and require authentication, except the login endpoint.

Let:

- `BASE` = `https://YOUR-WORKER-DOMAIN`
- `PREFIX` = empty when `SECRET_PATH` is not set, otherwise `/<SECRET_PATH>`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `{PREFIX}/api/login` | Authenticate administrator and create a session cookie. |
| `POST` | `{PREFIX}/api/logout` | Clear the session cookie. |
| `GET` | `{PREFIX}/api/users` | List users. |
| `POST` | `{PREFIX}/api/users` | Create a user. |
| `PATCH` | `{PREFIX}/api/users/{UUID}` | Update account status, expiration, or quota. |
| `DELETE` | `{PREFIX}/api/users/{UUID}` | Delete a user. |
| `GET` | `{PREFIX}/api/links/{UUID}` | Generate connection links for a user. |
| `GET` | `{PREFIX}/api/ext` | List configured endpoints. |
| `POST` | `{PREFIX}/api/ext` | Add or update an endpoint. |
| `DELETE` | `{PREFIX}/api/ext/{TAG}` | Remove an endpoint. |
| `GET` | `{PREFIX}/api/stats` | Retrieve stored daily traffic statistics. |
| `DELETE` | `{PREFIX}/api/stats` | Clear stored traffic statistics. |
| `GET` | `{PREFIX}/api/backup` | Download a JSON backup. |
| `POST` | `{PREFIX}/api/restore` | Restore users and endpoint configuration. |
| `GET` | `{PREFIX}/api/cleanip` | Retrieve clean-IP candidates. |

### User Creation Example

`POST {PREFIX}/api/users`

```json
{
  "name": "Example User",
  "days": 30,
  "quota": 100
}
```

- `name`: Account display name.
- `days`: Validity period in days. Use `0` for no expiration.
- `quota`: Traffic quota in GB. Use `0` for unlimited quota.

### User Update Example

`PATCH {PREFIX}/api/users/{UUID}`

```json
{
  "on": true,
  "days": 30,
  "quota": 100
}
```

All fields are optional. Only supplied fields are updated.

### Endpoint Creation Example

`POST {PREFIX}/api/ext`

```json
{
  "tag": "main",
  "address": "example.com",
  "port": 443,
  "proxyip": ""
}
```

- `tag`: Endpoint identifier used in generated connection paths.
- `address`: Optional connection address. If empty, the request hostname is used.
- `port`: One of the supported TLS ports.
- `proxyip`: Optional endpoint-specific fallback host/IP.

## Subscription URLs

A user's subscription URL follows this format:

```text
https://YOUR-WORKER-DOMAIN/[SECRET_PATH]/sub/USER_UUID
```

To filter the generated links by protocol, use the `proto` query parameter:

```text
?proto=vless
?proto=vmess
?proto=shadowsocks
?proto=trojan
```

The browser view can be opened with:

```text
?view
```

The subscription response includes usage and expiration metadata in the `subscription-userinfo` header.

## Storage

The Worker stores data in KV using these key patterns:

| Key | Purpose |
|---|---|
| `u:{UUID}` | User account data. |
| `cfg:ext` | Configured endpoint list. |
| `usage:{YYYY-MM-DD}` | Daily traffic statistics. |

## Security Considerations

- Use a strong, unique `ADMIN_PASS`.
- Keep the `DB` KV namespace private to this Worker.
- Do not publish administrator credentials or subscription UUIDs.
- Use HTTPS for panel access and client connections.
- Treat subscription URLs as sensitive credentials.
- `SECRET_PATH` does not replace authentication.
- Back up important data regularly and store backup files securely.

## Important Notes & Limitations

- This project is designed for the Cloudflare Workers runtime, not ordinary Node.js hosting.
- Actual connectivity depends on Cloudflare runtime capabilities, endpoint configuration, DNS, and network conditions.
- Traffic counters are accumulated in memory and periodically flushed to KV. Abrupt runtime termination can affect the most recent unflushed counters.
- Usage totals are calculated from the latest 31 daily usage records.
- The restore implementation recreates user records and endpoint settings, but does not preserve every possible user field (for example, the stored quota field is not copied into restored user records). Verify restored accounts before relying on them.
- The clean-IP feature retrieves candidate addresses from external sources; availability and performance are not guaranteed.

## License

No license is specified in the source file. Add a license before distributing or reusing this project if you want to define the permissions and conditions for others.

---

# فارسی

## معرفی پروژه

**M&F Panel** یک پنل مدیریت پروکسی و اشتراک است که بر بستر **Cloudflare Workers** اجرا می‌شود.

این پروژه امکان مدیریت کاربران، ساخت لینک‌های اتصال و اشتراک، کنترل حجم مصرفی، تعیین تاریخ انقضا، مدیریت Endpointها و تهیه نسخه پشتیبان را فراهم می‌کند.

هسته برنامه در فایل `worker.js` قرار دارد و برای ذخیره‌سازی اطلاعات از **Cloudflare Workers KV** استفاده می‌کند.

## امکانات

### مدیریت کاربران
- ساخت کاربر با UUID اختصاصی.
- تعیین مدت اعتبار حساب.
- تعیین محدودیت حجم مصرفی بر اساس GB.
- فعال یا غیرفعال کردن حساب.
- حذف کاربران.
- مشاهده اطلاعات اشتراک هر کاربر.

### پروتکل‌های پشتیبانی‌شده

امکان تولید لینک اتصال برای پروتکل‌های زیر وجود دارد:

- VLESS روی WebSocket + TLS
- VMess روی WebSocket + TLS
- Shadowsocks با رمزنگاری AES-128-GCM روی WebSocket + TLS
- Trojan روی WebSocket + TLS

### صفحه اشتراک کاربران

هر کاربر یک لینک اشتراک اختصاصی دریافت می‌کند که قابلیت‌های زیر را دارد:

- ارائه لینک‌های کانفیگ به‌صورت Base64 برای نرم‌افزارهای کلاینت.
- نمایش صفحه اختصاصی در مرورگر.
- نمایش وضعیت حساب و تاریخ انقضا.
- نمایش میزان آپلود و دانلود.
- نمایش حجم باقی‌مانده.
- نمایش QR Code.
- کپی لینک اشتراک و دریافت کانفیگ‌ها.

### مدیریت ترافیک
- محاسبه ترافیک آپلود و دانلود.
- ذخیره آمار مصرف روزانه در KV.
- اعمال محدودیت حجم برای کاربران.
- نمایش اطلاعات مصرف در صفحه اشتراک.

### مدیریت Endpointها
- افزودن و حذف Endpoint.
- تعریف Tag اختصاصی برای هر Endpoint.
- تنظیم Address و Port.
- تعریف Proxy IP جایگزین برای هر Endpoint.
- پشتیبانی از پورت‌های TLS زیر:

```text
443, 2053, 2083, 2087, 2096, 8443
```

### پشتیبان‌گیری و بازیابی
- دریافت بکاپ اطلاعات کاربران و Endpointها در قالب JSON.
- بازیابی اطلاعات از فایل بکاپ.
- پاک‌سازی آمار ترافیک ذخیره‌شده.

### امکانات تکمیلی
- دریافت فهرست Clean IPهای پیشنهادی Cloudflare.
- پشتیبانی از Proxy IP جایگزین سراسری.
- استفاده از Cache برای کاهش درخواست‌های تکراری به KV.
- رابط کاربری واکنش‌گرا.

## پیش‌نیازها

برای راه‌اندازی پروژه به موارد زیر نیاز دارید:

- حساب Cloudflare با دسترسی به Workers.
- یک KV Namespace.
- یکی از روش‌های Deploy:
  - Cloudflare Dashboard
  - Wrangler CLI

این پروژه از APIهای اختصاصی Cloudflare مانند `cloudflare:sockets`، `WebSocketPair` و قابلیت‌های Runtime مربوط به Workers استفاده می‌کند؛ بنابراین یک برنامه معمولی Node.js نیست و با دستور `node worker.js` اجرا نمی‌شود.

## نصب و راه‌اندازی

### مرحله ۱: ساخت KV Namespace

1. وارد Cloudflare Dashboard شوید.
2. به بخش **Workers & Pages** بروید.
3. بخش **KV** را باز کنید.
4. یک Namespace با نامی مانند `MF_PANEL_DB` بسازید.

### مرحله ۲: ایجاد Worker

1. وارد بخش **Workers & Pages** شوید.
2. یک Worker جدید بسازید.
3. ویرایشگر کد Worker را باز کنید.
4. محتوای فایل `worker.js` را جایگزین کد پیش‌فرض کنید.
5. پروژه را Save و Deploy کنید.

### مرحله ۳: اتصال KV به Worker

از تنظیمات Worker وارد بخش **Bindings** شوید و یک KV Namespace Binding اضافه کنید:

| تنظیم | مقدار |
|---|---|
| Variable name | `DB` |
| KV namespace | `MF_PANEL_DB` |

**نکته:** نام Binding حتماً باید `DB` باشد؛ زیرا کد پروژه از `env.DB` استفاده می‌کند.

### مرحله ۴: تعریف Environment Variables

در تنظیمات Worker متغیرهای زیر را تعریف کنید:

| متغیر | ضروری | توضیحات |
|---|---|---|
| `ADMIN_PASS` | بله | رمز عبور مدیر پنل |
| `ADMIN_USER` | خیر | نام کاربری مدیر؛ مقدار پیش‌فرض `admin` |
| `SECRET_PATH` | خیر | مسیر خصوصی برای دسترسی به پنل و اشتراک‌ها |
| `PROXYIP` | خیر | آدرس یا IP جایگزین سراسری |

**توصیه امنیتی:** مقدار `ADMIN_PASS` را به‌صورت Secret ذخیره کنید، نه یک متغیر متنی معمولی.

برای عملکرد صحیح پنل، وجود `ADMIN_PASS` و Binding با نام `DB` الزامی است.

### مرحله ۵: ورود به پنل

پس از Deploy، آدرس زیر را باز کنید:

```text
https://YOUR-WORKER-DOMAIN/SECRET_PATH/panel
```

اگر `SECRET_PATH` تنظیم نشده باشد:

```text
https://YOUR-WORKER-DOMAIN/panel
```

سپس با نام کاربری و رمز عبوری که تعریف کرده‌اید وارد شوید.

## توضیحات تنظیمات

### SECRET_PATH

این متغیر اختیاری است و یک پیشوند به مسیر پنل مدیریت، API و لینک‌های اشتراک اضافه می‌کند.

برای مثال:

```text
SECRET_PATH=my-private-path
```

آدرس پنل به شکل زیر خواهد بود:

```text
https://YOUR-WORKER-DOMAIN/my-private-path/panel
```

در مقدار این متغیر از اسلش ابتدا و انتهای مسیر استفاده نکنید.

این قابلیت صرفاً یک لایه پنهان‌سازی مسیر است و جایگزین احراز هویت نیست.

### PROXYIP

این متغیر یک آدرس جایگزین سراسری برای اتصال است. اگر اتصال مستقیم به مقصد ناموفق باشد، Worker در صورت تنظیم این مقدار، تلاش می‌کند از آن استفاده کند.

اگر برای یک Endpoint مقدار `proxyip` جداگانه تعریف شده باشد، همان مقدار نسبت به `PROXYIP` سراسری اولویت دارد.

### پورت‌های Endpoint

پورت‌های قابل قبول برای Endpointها:

```text
443, 2053, 2083, 2087, 2096, 8443
```

## مستندات API

تمام مسیرهای مدیریتی به‌جز مسیر ورود، نیازمند احراز هویت هستند.

اگر `SECRET_PATH` تنظیم شده باشد، باید آن را به ابتدای مسیر API اضافه کنید.

| متد | مسیر | عملکرد |
|---|---|---|
| `POST` | `{PREFIX}/api/login` | ورود مدیر و ساخت Session |
| `POST` | `{PREFIX}/api/logout` | خروج از پنل |
| `GET` | `{PREFIX}/api/users` | دریافت فهرست کاربران |
| `POST` | `{PREFIX}/api/users` | ساخت کاربر جدید |
| `PATCH` | `{PREFIX}/api/users/{UUID}` | ویرایش وضعیت، اعتبار یا حجم |
| `DELETE` | `{PREFIX}/api/users/{UUID}` | حذف کاربر |
| `GET` | `{PREFIX}/api/links/{UUID}` | تولید لینک‌های اتصال |
| `GET` | `{PREFIX}/api/ext` | دریافت Endpointها |
| `POST` | `{PREFIX}/api/ext` | افزودن یا به‌روزرسانی Endpoint |
| `DELETE` | `{PREFIX}/api/ext/{TAG}` | حذف Endpoint |
| `GET` | `{PREFIX}/api/stats` | دریافت آمار ترافیک |
| `DELETE` | `{PREFIX}/api/stats` | پاک‌سازی آمار ترافیک |
| `GET` | `{PREFIX}/api/backup` | دریافت فایل بکاپ |
| `POST` | `{PREFIX}/api/restore` | بازیابی کاربران و Endpointها |
| `GET` | `{PREFIX}/api/cleanip` | دریافت Clean IPهای پیشنهادی |

### نمونه ساخت کاربر

درخواست:

`POST {PREFIX}/api/users`

```json
{
  "name": "Example User",
  "days": 30,
  "quota": 100
}
```

توضیحات:

- `name`: نام کاربر.
- `days`: مدت اعتبار بر حسب روز؛ مقدار `0` یعنی بدون تاریخ انقضا.
- `quota`: حجم مجاز بر حسب GB؛ مقدار `0` یعنی نامحدود.

### نمونه ویرایش کاربر

`PATCH {PREFIX}/api/users/{UUID}`

```json
{
  "on": true,
  "days": 30,
  "quota": 100
}
```

تمام فیلدها اختیاری هستند و فقط فیلدهای ارسال‌شده تغییر می‌کنند.

### نمونه افزودن Endpoint

`POST {PREFIX}/api/ext`

```json
{
  "tag": "main",
  "address": "example.com",
  "port": 443,
  "proxyip": ""
}
```

- `tag`: شناسه Endpoint که در مسیر لینک‌های تولیدشده استفاده می‌شود.
- `address`: آدرس اتصال؛ در صورت خالی بودن از Host درخواست استفاده می‌شود.
- `port`: یکی از پورت‌های TLS پشتیبانی‌شده.
- `proxyip`: آدرس جایگزین اختصاصی Endpoint.

## لینک اشتراک کاربران

ساختار لینک اشتراک به شکل زیر است:

```text
https://YOUR-WORKER-DOMAIN/[SECRET_PATH]/sub/USER_UUID
```

برای محدود کردن خروجی به یک پروتکل می‌توانید از پارامتر `proto` استفاده کنید:

```text
?proto=vless
?proto=vmess
?proto=shadowsocks
?proto=trojan
```

برای نمایش صفحه وب اشتراک:

```text
?view
```

اطلاعات مصرف و تاریخ انقضا نیز از طریق Header با نام `subscription-userinfo` ارائه می‌شود.

## ساختار ذخیره‌سازی

اطلاعات در KV با کلیدهای زیر ذخیره می‌شوند:

| کلید | کاربرد |
|---|---|
| `u:{UUID}` | اطلاعات حساب کاربر |
| `cfg:ext` | فهرست Endpointها |
| `usage:{YYYY-MM-DD}` | آمار ترافیک روزانه |

## نکات امنیتی

- از رمز عبور قوی و اختصاصی برای مدیر استفاده کنید.
- Namespace مربوط به KV را فقط به Worker موردنیاز متصل کنید.
- اطلاعات ورود مدیر و UUID اشتراک‌ها را عمومی نکنید.
- برای ورود به پنل و اتصال کلاینت‌ها از HTTPS استفاده کنید.
- لینک اشتراک هر کاربر را مانند یک رمز عبور محرمانه نگهداری کنید.
- `SECRET_PATH` جایگزین احراز هویت نیست.
- به‌صورت منظم از اطلاعات پنل بکاپ تهیه کنید و فایل بکاپ را در محل امن نگه دارید.

## محدودیت‌ها و نکات مهم

- این پروژه برای محیط Cloudflare Workers طراحی شده و روی Node.js معمولی اجرا نمی‌شود.
- کیفیت اتصال به قابلیت‌های Runtime کلادفلر، تنظیمات Endpoint، DNS و شرایط شبکه بستگی دارد.
- شمارنده‌های ترافیک ابتدا در حافظه جمع‌آوری و سپس به‌صورت دوره‌ای در KV ذخیره می‌شوند؛ بنابراین توقف ناگهانی Runtime ممکن است روی آخرین آمار ذخیره‌نشده اثر بگذارد.
- محاسبه مجموع مصرف از حداکثر ۳۱ رکورد روزانه اخیر انجام می‌شود.
- کد بازیابی، اطلاعات کاربران و Endpointها را بازسازی می‌کند، اما تمام فیلدهای احتمالی کاربر را حفظ نمی‌کند؛ برای مثال فیلد حجم ذخیره‌شده (`q`) در رکورد بازیابی‌شده کپی نمی‌شود. پس از Restore، حساب‌ها را بررسی کنید.
- Clean IPها از منابع خارجی دریافت می‌شوند و در دسترس بودن یا سرعت آن‌ها تضمین‌شده نیست.

## مجوز استفاده (License)

در فایل منبع پروژه مجوزی مشخص نشده است. اگر قصد انتشار یا استفاده مجدد از پروژه را دارید، پیش از توزیع، مجوز مناسب را اضافه کنید.

---

<p align="center">
  <b>M&F Panel</b><br>
  Built for Cloudflare Workers
</p>
