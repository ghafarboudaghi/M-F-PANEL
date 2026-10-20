"use strict";

// Katabump entry for M&F PANEL (vpn-ui v1.9.4).
// Non-root container runner with integrated User Portal (Auth & Subscription Dashboard).
// The stock install.sh needs root, systemd, apt and kernel interfaces.
// This process owns the one public TCP port, starts the panel on an
// internal port, pre-creates every protocol that can actually run here,
// and serves the user authentication and subscription management portal.

const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");

const VERSION = "mf-panel-katabump-1.1";
const BRAND = "M&F Panel";

const BRAND_FILES = {
  'logo.svg': { type: 'image/svg+xml', b64: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+CiAgPHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjQ2IiBoZWlnaHQ9IjQ2IiByeD0iMTQiIGZpbGw9IiMwYzEyMWQiIHN0cm9rZT0iIzAwZjBmZiIgc3Ryb2tlLXdpZHRoPSIyIi8+CiAgPHRleHQgeD0iMjQiIHk9IjMwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9IjcwMCIgbGV0dGVyLXNwYWNpbmc9IjAuNSIgZmlsbD0iIzAwZjBmZiI+TSZhbXA7RjwvdGV4dD4KPC9zdmc+' },
  'theme.css': { type: 'text/css; charset=utf-8', b64: 'LyogTSZGIFBBTkVMIC8gRW1iZXIuIFByZXNlbnRhdGlvbiBvbmx5OyBubyBwcm90b2NvbCBvciBBUEkgY2hhbmdlcy4KICAgTm8gcmVtb3RlIGZvbnRzLCBjYW52YXMsIGJsdXIgZmlsdGVycyBvciBjb250aW51b3VzIGFuaW1hdGlvbi4gKi8KaHRtbFtkYXRhLWFsaXJlemEtdGhlbWU9ImVtYmVyIl0sCmh0bWxbZGF0YS1hbGlyZXphLXRoZW1lPSJlbWJlciJdIGJvZHksCmh0bWxbZGF0YS1hbGlyZXphLXRoZW1lPSJlbWJlciJdW2RhdGEtdGhlbWU9InVsdHJhLWRhcmsiXSBib2R5LmRhcmsgewogIC0tYXAtYmc6IzA4MGIxMjsgLS1hcC1zdXJmYWNlOiMwZjE0MjA7IC0tYXAtcmFpc2VkOiMxNzFlMmQ7CiAgLS1hcC1ib3JkZXI6IzI3MzI0ODsgLS1hcC10ZXh0OiNmNGY3ZmY7IC0tYXAtbXV0ZWQ6IzlkYTliZDsKICAtLWFwLW9yYW5nZTojMDBmMGZmOyAtLWFwLW9yYW5nZS1ob3ZlcjojMzhiZGY4OyAtLWFwLW9yYW5nZS1zb2Z0OnJnYmEoMCwyNDAsMjU1LC4xNCk7CiAgLS1hcC1vbi1vcmFuZ2U6IzAzMTMxYjsgLS1hcC1yaW5nOnJnYmEoMCwyNDAsMjU1LC4yNCk7CiAgLS1iZzp2YXIoLS1hcC1iZyk7IC0tc3VyZmFjZTp2YXIoLS1hcC1zdXJmYWNlKTsgLS1zdXJmYWNlLTI6dmFyKC0tYXAtcmFpc2VkKTsKICAtLWJvcmRlcjp2YXIoLS1hcC1ib3JkZXIpOyAtLWJvcmRlci1zdHJvbmc6IzI4NjE1YTsKICAtLXRleHQ6dmFyKC0tYXAtdGV4dCk7IC0tdGV4dC0yOnZhcigtLWFwLW11dGVkKTsgLS10ZXh0LTM6I2E5YTM5ZDsKICAtLWFjY2VudDp2YXIoLS1hcC1vcmFuZ2UpOyAtLWFjY2VudC1zdHJvbmc6dmFyKC0tYXAtb3JhbmdlKTsKICAtLWFjY2VudC13ZWFrOnZhcigtLWFwLW9yYW5nZS1zb2Z0KTsgLS1vbi1hY2NlbnQ6dmFyKC0tYXAtb24tb3JhbmdlKTsKICAtLWNvbG9yLXByaW1hcnktMTAwOnZhcigtLWFwLW9yYW5nZSk7CiAgLS1yYWRpdXMtc206OHB4OyAtLXJhZGl1cy1tZDoxMnB4OyAtLXJhZGl1cy1sZzoxNnB4OyAtLXJhZGl1cy14bDoyMHB4OwogIC0tZGFyay1jb2xvci1iYWNrZ3JvdW5kOnZhcigtLWFwLWJnKTsKICAtLWRhcmstY29sb3Itc3VyZmFjZS0xMDA6dmFyKC0tYXAtc3VyZmFjZSk7CiAgLS1kYXJrLWNvbG9yLXN1cmZhY2UtMjAwOnZhcigtLWFwLXJhaXNlZCk7CiAgLS1kYXJrLWNvbG9yLXN1cmZhY2UtMzAwOiMzMDMwMzc7IC0tZGFyay1jb2xvci1zdXJmYWNlLTQwMDojMzkzOTQwOwogIC0tZGFyay1jb2xvci1zdXJmYWNlLTUwMDojMzQzNDNjOyAtLWRhcmstY29sb3Itc3VyZmFjZS02MDA6IzNlM2U0NjsKICAtLWRhcmstY29sb3Itc3VyZmFjZS03MDA6IzEzMTMxNjsgLS1kYXJrLWNvbG9yLXN1cmZhY2UtNzAwLXJnYjoxOSwxOSwyMjsKICAtLWRhcmstY29sb3ItdGV4dC1wcmltYXJ5OnZhcigtLWFwLXRleHQpOyAtLWRhcmstY29sb3ItdGV4dC1zZWNvbmRhcnk6dmFyKC0tYXAtbXV0ZWQpOwogIC0tZGFyay1jb2xvci1zdHJva2U6dmFyKC0tYXAtYm9yZGVyKTsgLS1kYXJrLWNvbG9yLXRhYmxlLWhvdmVyOiMyNDIxMjU7CiAgLS1kYXJrLWNvbG9yLXRhYmxlLWhlYWRlci1iZzojMTQxNDE3OyAtLWRhcmstY29sb3ItdGFibGUtYm9keS1iZzp2YXIoLS1hcC1zdXJmYWNlKTsKICAtLWRhcmstY29sb3ItdGFibGUtcm93LXNlbGVjdGVkOiMzNTEwMTg7IC0tZGFyay1jb2xvci10YWJsZS1yb3ctc2VsZWN0ZWQtaG92ZXI6IzRhMTUyMDsKICAtLWRhcmstY29sb3ItdGFibGUtY29sdW1uLXNvcnRlZC1iZzojMjQxMTE2OyAtLWRhcmstY29sb3ItdGFibGUtcmluZzojNTQyMTJhOwogIC0tZGFyay1jb2xvci10YWJsZS1maWx0ZXItZHJvcGRvd24tYmc6dmFyKC0tYXAtcmFpc2VkKTsKICAtLWRhcmstY29sb3ItdGFibGUtcGFnaW5hdGlvbi1zdXJmYWNlOnZhcigtLWFwLXJhaXNlZCk7CiAgLS1kYXJrLWNvbG9yLXNjcm9sbGJhcjojM2IyMDI2OyAtLWRhcmstY29sb3Itc2Nyb2xsYmFyLXdlYmtpdDojN2EyNjM0OwogIC0tZGFyay1jb2xvci1zY3JvbGxiYXItd2Via2l0LWhvdmVyOiNmZjI2M2Y7CiAgLS1kYXJrLWNvbG9yLXNwaW4tY29udGFpbmVyOnZhcigtLWFwLXN1cmZhY2UpOyAtLWRhcmstY29sb3ItdG9vbHRpcDojMzAzMDM3OwogIC0tZGFyay1jb2xvci1jb2RlbWlycm9yLWxpbmUtaG92ZXI6IzM1MjcxZTsKICAtLWRhcmstY29sb3ItY29kZW1pcnJvci1saW5lLXNlbGVjdGlvbjojNGEzNTI2OwogIC8qIE5hdGl2ZSBBZEd1YXJkIGN1c3RvbSBwcm9wZXJ0aWVzLCBpbmNsdWRpbmcgZHJvcGRvd25zIGFuZCBxdWVyeS1sb2cgcm93cy4gKi8KICAtLWJsYWNrOnZhcigtLWFwLXRleHQpOyAtLWJnY29sb3I6dmFyKC0tYXAtYmcpOyAtLW1jb2xvcjp2YXIoLS1hcC10ZXh0KTsKICAtLXNjb2xvcjp2YXIoLS1hcC1tdXRlZCk7IC0tYm9yZGVyLWNvbG9yOnZhcigtLWFwLWJvcmRlcik7CiAgLS1oZWFkZXItYmdjb2xvcjojMTQxNDE2OyAtLWNhcmQtYmdjb2xvcjp2YXIoLS1hcC1zdXJmYWNlKTsKICAtLWNhcmQtYm9yZGVyLWNvbG9yOnZhcigtLWFwLWJvcmRlcik7IC0tY3RybC1iZ2NvbG9yOiMxMTExMTQ7CiAgLS1jdHJsLXNlbGVjdC1iZ2NvbG9yOnZhcigtLWFwLXJhaXNlZCk7IC0tY3RybC1kcm9wZG93bi1jb2xvcjp2YXIoLS1hcC10ZXh0KTsKICAtLWN0cmwtZHJvcGRvd24tYmdjb2xvci1mb2N1czp2YXIoLS1hcC1vcmFuZ2Utc29mdCk7IC0tY3RybC1kcm9wZG93bi1jb2xvci1mb2N1czp2YXIoLS1hcC1vcmFuZ2UpOwogIC0tZm9ybS1kaXNhYmxlZC1iZ2NvbG9yOiMyNDI0Mjk7IC0tZm9ybS1kaXNhYmxlZC1jb2xvcjojYTM5Yzk2OwogIC0tcnQtbm9kYXRhLWJnY29sb3I6dmFyKC0tYXAtc3VyZmFjZSk7IC0tcnQtbm9kYXRhLWNvbG9yOnZhcigtLWFwLW11dGVkKTsKICAtLW1vZGFsLW92ZXJsYXktYmdjb2xvcjpyZ2JhKDAsMCwwLC43KTsgLS1sb2FkaW5nLWJnOnZhcigtLWFwLWJnKTsKICAtLWxvZ3NfX3RhYmxlLWJnY29sb3I6dmFyKC0tYXAtc3VyZmFjZSk7IC0tbG9nc19fcm93LS13aGl0ZS1iZ2NvbG9yOnZhcigtLWFwLXN1cmZhY2UpOwogIC0tbG9nc19fcm93LS1ibHVlLWJnY29sb3I6IzIzMmQzZDsgLS1sb2dzX190ZXh0LWNvbG9yOnZhcigtLWFwLXRleHQpOwogIC0tYWxlcnQtbWVzc2FnZS1jb2xvcjojZmZkY2UxOyAtLWFsZXJ0LW1lc3NhZ2UtYm9yZGVyOiM2MzIwMmM7IC0tYWxlcnQtbWVzc2FnZS1iZzojMjQxMDE2OwogIC0tY2hlY2tib3gtYmc6IzRhNDU0MTsgLS1yYWRpby1iZzojNGE0NTQxOwogIGNvbG9yLXNjaGVtZTpkYXJrOwp9Cg==' },
  'brand.js': { type: 'text/javascript; charset=utf-8', b64: 'LyogTSZGIFBBTkVMIHByZXNlbnRhdGlvbiBhZGFwdGVyLiAqLwooKCkgPT4gewogICd1c2Ugc3RyaWN0JzsKICBjb25zdCBjb25maWcgPSB3aW5kb3cuQUxJUkVaQTsKICBpZiAoIWNvbmZpZykgcmV0dXJuOwogIGNvbnN0IGJhc2UgPSBjb25maWcuYmFzZTsKICBjb25zdCBicmFuZCA9ICdNJkYgUGFuZWwnOwogIGNvbnN0IG5hbWVzID0gL0FkR3VhcmRccypIb21lfFZQTltzLV0/VUl8M1gtVUl8TkZccypQQU5FTC9naTsKICBjb25zdCBpZ25vcmVkID0gJ3NjcmlwdCxzdHlsZSx0ZXh0YXJlYSxpbnB1dCxwcmUsY29kZSxbY29udGVudGVkaXRhYmxlPSJ0cnVlIl0sLmxvZ3NfX3RhYmxlLC5xdWVyeS1sb2csLmFjZV9lZGl0b3InOwogIGNvbnN0IHJlcGxhY2UgPSAodmFsdWUpID0+IHZhbHVlLnJlcGxhY2UobmFtZXMsIGJyYW5kKTsKICBjb25zdCBzZWVuID0gbmV3IFdlYWtTZXQoKTsKICBmdW5jdGlvbiB2aXNpdChyb290KSB7CiAgICBpZiAocm9vdC5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHsKICAgICAgaWYgKHJvb3QucGFyZW50RWxlbWVudCAmJiAhcm9vdC5wYXJlbnRFbGVtZW50LmNsb3Nlc3QoaWdub3JlZCkpIHsKICAgICAgICBjb25zdCBuZXh0ID0gcmVwbGFjZShyb290Lm5vZGVWYWx1ZSk7CiAgICAgICAgaWYgKG5leHQgIT09IHJvb3Qubm9kZVZhbHVlKSByb290Lm5vZGVWYWx1ZSA9IG5leHQ7CiAgICAgIH0KICAgICAgcmV0dXJuOwogICAgfQogICAgaWYgKHJvb3Qubm9kZVR5cGUgIT09IE5vZGUuRUxFTUVOVF9OT0RFIHx8IHJvb3QubWF0Y2hlcyhpZ25vcmVkKSkgcmV0dXJuOwogICAgZm9yIChjb25zdCBhdHRyIG9mIFsndGl0bGUnLCAnYWx0JywgJ2FyaWEtbGFiZWwnXSkgewogICAgICBpZiAocm9vdC5oYXNBdHRyaWJ1dGUoYXR0cikpIHsKICAgICAgICBjb25zdCBwcmV2aW91cyA9IHJvb3QuZ2V0QXR0cmlidXRlKGF0dHIpLCBuZXh0ID0gcmVwbGFjZShwcmV2aW91cyk7CiAgICAgICAgaWYgKG5leHQgIT09IHByZXZpb3VzKSByb290LnNldEF0dHJpYnV0ZShhdHRyLCBuZXh0KTsKICAgICAgfQogICAgfQogICAgZm9yIChjb25zdCBjaGlsZCBvZiByb290LmNoaWxkTm9kZXMpIHZpc2l0KGNoaWxkKTsKICB9CiAgZnVuY3Rpb24gaWRlbnRpdHkoKSB7CiAgICBjb25zdCB0aXRsZSA9IGJyYW5kICsgKGNvbmZpZy5kbnMgPyAnIMK3IEROUycgOiAnJyk7CiAgICBpZiAoZG9jdW1lbnQudGl0bGUgIT09IHRpdGxlKSBkb2N1bWVudC50aXRsZSA9IHRpdGxlOwogICAgZm9yIChjb25zdCBpY29uIG9mIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2xpbmtbcmVsfj0iaWNvbiJdJykpIHsKICAgICAgY29uc3QgdGFyZ2V0ID0gYmFzZSArICdfYWxpcmV6YS9sb2dvLnN2Zz92PTEuMS4wJzsKICAgICAgaWYgKGljb24uZ2V0QXR0cmlidXRlKCdocmVmJykgIT09IHRhcmdldCkgaWNvbi5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCB0YXJnZXQpOwogICAgfQogICAgaWYgKCFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdsaW5rW3JlbH49Imljb24iXScpKSB7CiAgICAgIGNvbnN0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7IGxpbmsucmVsID0gJ2ljb24nOwogICAgICBsaW5rLmhyZWYgPSBiYXNlICsgJ19hbGlyZXphL2xvZ28uc3ZnP3Y9MS4xLjAnOyBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGxpbmspOwogICAgfQogICAgZm9yIChjb25zdCBsb2dvIG9mIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5iby1yYWlsLWJyYW5kIGltZywubG9naW4tbG9nbyBpbWcsLmhlYWRlci1icmFuZC1pbWcsaW1nW2FsdD0iYWxpcmV6YXBhbmVsIl0nKSkgewogICAgICBpZiAoc2Vlbi5oYXMobG9nbykpIGNvbnRpbnVlOwogICAgICBzZWVuLmFkZChsb2dvKTsKICAgICAgaWYgKGxvZ28udGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnaW1nJykgewogICAgICAgIGxvZ28uc3JjID0gYmFzZSArICdfYWxpcmV6YS9sb2dvLnN2Zz92PTEuMS4wJzsgbG9nby5hbHQgPSBicmFuZDsKICAgICAgfSBlbHNlIHsKICAgICAgICBsb2dvLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7CiAgICAgIH0KICAgICAgY29uc3QgcGFyZW50ID0gbG9nby5wYXJlbnRFbGVtZW50OwogICAgICBpZiAocGFyZW50ICYmICFwYXJlbnQucXVlcnlTZWxlY3RvcignLmFsaXJlemEtbmFtZScpKSB7CiAgICAgICAgY29uc3QgbGFiZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7CiAgICAgICAgbGFiZWwuY2xhc3NOYW1lID0gJ2FsaXJlemEtbmFtZSc7IGxhYmVsLnRleHRDb250ZW50ID0gYnJhbmQ7CiAgICAgICAgcGFyZW50LmFwcGVuZENoaWxkKGxhYmVsKTsKICAgICAgfQogICAgfQogIH0KICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7CiAgc3R5bGUudGV4dENvbnRlbnQgPSAnLmFsaXJlemEtbmFtZXtmb250OjYwMCAxNXB4IHN5c3RlbS11aSxzYW5zLXNlcmlmO2xldHRlci1zcGFjaW5nOi0uNHB4O3doaXRlLXNwYWNlOm5vd3JhcH0nICsKICAgICcuYm8tcmFpbC1icmFuZCBhe2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjdweDtmbGV4LXdyYXA6d3JhcDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyfScgKwogICAgJy5iby1yYWlsLWJyYW5kIC5hbGlyZXphLW5hbWV7Zm9udC1zaXplOjExcHh9LmJvLXJhaWwtYnJhbmQgaW1ne3dpZHRoOjMwcHg7aGVpZ2h0OjMwcHg7b2JqZWN0LWZpdDpjb250YWlufScgKwogICAgJy5iby1yYWlsLS1jb2xsYXBzZWQgLmFsaXJlemEtbmFtZXtkaXNwbGF5Om5vbmV9JzsKICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTsKICBsZXQgcGVuZGluZyA9IGZhbHNlOwogIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIocmVjb3JkcyA9PiB7CiAgICBmb3IgKGNvbnN0IHJlY29yZCBvZiByZWNvcmRzKSB7CiAgICAgIGlmIChyZWNvcmQudHlwZSA9PT0gJ2NoYXJhY3RlckRhdGEnKSB2aXNpdChyZWNvcmQudGFyZ2V0KTsKICAgICAgZWxzZSBmb3IgKGNvbnN0IG5vZGUgb2YgcmVjb3JkLmFkZGVkTm9kZXMpIHZpc2l0KG5vZGUpOwogICAgfQogICAgaWYgKCFwZW5kaW5nKSB7IHBlbmRpbmcgPSB0cnVlOyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4geyBwZW5kaW5nID0gZmFsc2U7IGlkZW50aXR5KCk7IH0pOyB9CiAgfSk7CiAgdmlzaXQoZG9jdW1lbnQuYm9keSk7IGlkZW50aXR5KCk7CiAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHtjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUsIGNoYXJhY3RlckRhdGE6IHRydWV9KTsKfSkoKTs=' },
};

const VPN_URL = "https://github.com/Sir-MmD/vpn-ui/releases/download/v1.9.4/vpn-ui-amd64";
const VPN_SHA = "18ec321d9074b319bd5756508bbc523ab5d95450b832c406acdd72e987a2da8f";
const PANEL_PORT = 18080;
const USER_PORT = 18081;
const BASE = "/kb";
const PUBLIC_PORT = Number(process.env.SERVER_PORT || process.env.PORT || 8080);

const ROOT = process.env.KATABUMP_ROOT
  || (fs.existsSync("/home/container") ? "/home/container" : process.cwd());
const VPN_DIR = path.join(ROOT, "vpn");
const BIN = path.join(VPN_DIR, "vpn-ui-amd64");
const MARK = BIN + ".ok";
const DATA = path.join(VPN_DIR, "data");
const BIN_DIR = path.join(VPN_DIR, "bin");
const LOG_DIR = path.join(VPN_DIR, "log");
const ACCESS = path.join(VPN_DIR, "PANEL.txt");
const STATE = path.join(VPN_DIR, "state.json");
const USERS_FILE = path.join(DATA, "mf_users.json");

// ---- Registration policy & per-user limits (all optional, set in Environment) ----
// REGISTRATION = open (default) | closed
//   open   : anyone can sign up (no code)
//   closed : nobody can sign up
const REGISTRATION = String(process.env.REGISTRATION || "open").trim().toLowerCase() === "closed" ? "closed" : "open";
// Limits applied to NEW users. 0 = unlimited. (Existing users keep what they have.)
const USER_TRAFFIC_GB = Math.max(0, Number(process.env.USER_TRAFFIC_GB) || 0);
const USER_EXPIRY_DAYS = Math.max(0, Math.floor(Number(process.env.USER_EXPIRY_DAYS) || 0));
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const faDigits = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const PORTS = {
  vless: 21001,
  trojan: 21002,
  ss: 21003,
  vlessWs: 21011,
  vmessWs: 21012,
  trojanWs: 21013,
  grpc: 21014,
  upgrade: 21015,
};

const PATHS = {
  "/bp-vless": PORTS.vlessWs,
  "/bp-vmess": PORTS.vmessWs,
  "/bp-trojan": PORTS.trojanWs,
  "/bp-up": PORTS.upgrade,
};

// Unique bytes inside vpn-ui v1.9.4 requireRoot, ending at the euid==0 jump.
// Replacing that jump with an unconditional return lets the web panel boot
// without root. It does not grant kernel capabilities.
const PATCH_NEEDLE = Buffer.from("3425f8ffffff48837c2420000f84f4000000", "hex");
const PATCH_JUMP = Buffer.from("e9f500000090", "hex");
const PATCH_EXPECT = Buffer.from("0f84f4000000", "hex");

const state = {
  ready: false,
  status: "در حال شروع",
  note: "",
  publicHost: "",
  child: null,
  stopping: false,
  adminCookie: null,
  sessionSecret: "",
};

function log(line) {
  process.stdout.write("[" + new Date().toISOString() + "] " + line + "\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDirs() {
  for (const dir of [VPN_DIR, DATA, BIN_DIR, LOG_DIR]) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { return {}; }
}

function writeState(obj) {
  const next = Object.assign(readState(), obj);
  const tmp = STATE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, STATE);
}

function cgroupLimit() {
  const files = ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf8").trim();
      if (!raw || raw === "max") continue;
      const n = Number(raw);
      if (n > 0 && n < 1e15) return n;
    } catch (e) {}
  }
  return 0;
}

function diskFree(dir) {
  const result = spawnSync("df", ["-B1", dir], { encoding: "utf8", timeout: 8000 });
  if (result.status !== 0 || !result.stdout) return 0;
  const rows = result.stdout.trim().split("\n");
  const cols = rows[rows.length - 1].trim().split(/\s+/);
  return Number(cols[3]) || 0;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    let seen = 0;
    let last = 0;
    fs.createReadStream(file)
      .on("data", (chunk) => {
        hash.update(chunk);
        seen += chunk.length;
        const now = Date.now();
        if (now - last > 8000) {
          last = now;
          state.status = "در حال بررسی فایل، " + Math.floor(seen / (1024 * 1024)) + " مگابایت خوانده شد";
          log(state.status);
        }
      })
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

function hasCurl() {
  const result = spawnSync("curl", ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function downloadPulse(part, label) {
  const timer = setInterval(() => {
    let size = 0;
    try { size = fs.statSync(part).size; } catch (e) {}
    state.status = label + ": " + Math.floor(size / (1024 * 1024)) + " مگابایت";
    log(state.status);
  }, 8000);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}

function downloadWithCurl(url, dest) {
  return new Promise((resolve, reject) => {
    const part = dest + ".part";
    const stop = downloadPulse(part, "دانلود ادامه دارد");
    const child = spawn("curl", [
      "-fL", "--retry", "8", "--retry-all-errors", "--retry-delay", "3",
      "-C", "-", "--speed-time", "40", "--speed-limit", "2048",
      "-o", part, url,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (buf) => { err += buf.toString("utf8").slice(-500); });
    child.on("error", (e) => { stop(); reject(e); });
    child.on("exit", (code) => {
      stop();
      if (code === 33) {
        try { fs.rmSync(part, { force: true }); } catch (e) {}
        return reject(Object.assign(new Error("resume"), { resume: true }));
      }
      if (code !== 0) return reject(new Error("دانلود ناموفق شد، کد " + code + " " + err.slice(-180)));
      fs.renameSync(part, dest);
      resolve();
    });
  });
}

function downloadWithNode(url, dest, redirects) {
  return new Promise((resolve, reject) => {
    const part = dest + ".part";
    let start = 0;
    try { start = fs.statSync(part).size; } catch (e) {}
    const headers = { "User-Agent": "mf-panel-katabump" };
    if (start > 0) headers.Range = "bytes=" + start + "-";
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if ((redirects || 0) > 8) return reject(new Error("دانلود بیش از حد ریدایرکت شد"));
        const next = new URL(res.headers.location, url).href;
        return resolve(downloadWithNode(next, dest, (redirects || 0) + 1));
      }
      if (res.statusCode === 416) {
        res.resume();
        try { fs.renameSync(part, dest); } catch (e) {}
        return resolve();
      }
      const append = res.statusCode === 206 && start > 0;
      if (res.statusCode !== 200 && !append) {
        res.resume();
        return reject(new Error("دانلود ناموفق شد، HTTP " + res.statusCode));
      }
      if (!append && start > 0) {
        try { fs.rmSync(part, { force: true }); } catch (e) {}
      }
      const out = fs.createWriteStream(part, { flags: append ? "a" : "w" });
      let idle;
      const arm = () => {
        clearTimeout(idle);
        idle = setTimeout(() => req.destroy(new Error("دانلود قطع شد و دوباره ادامه داده می‌شود")), 45000);
      };
      arm();
      res.on("data", () => arm());
      res.pipe(out);
      out.on("error", (err) => { clearTimeout(idle); reject(err); });
      out.on("finish", () => {
        clearTimeout(idle);
        out.close(() => {
          fs.renameSync(part, dest);
          resolve();
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(0);
  });
}

async function download(url, dest) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (hasCurl()) {
        try {
          await downloadWithCurl(url, dest);
        } catch (e) {
          if (!e.resume) throw e;
          await downloadWithCurl(url, dest);
        }
      } else {
        await downloadWithNode(url, dest, 0);
      }
      return;
    } catch (e) {
      last = e;
      log("دانلود قطع شد، از همان‌جا ادامه داده می‌شود: " + e.message);
      await sleep(2000);
    }
  }
  throw last;
}

const GLIBC_DIR = path.join(VPN_DIR, "glibc");
// [url, local name, expected SHA-256]. Hashes match Ubuntu's signed jammy / jammy-updates Packages index.
const GLIBC_DEBS = [
  ["https://archive.ubuntu.com/ubuntu/pool/main/g/glibc/libc6_2.35-0ubuntu3.15_amd64.deb", "libc6.deb",
    "79e35256227e16a607c154cdeb8d76ff12d20e31de286ea7fd9ad3b96fe0452d"],
  ["https://archive.ubuntu.com/ubuntu/pool/main/g/gcc-12/libgcc-s1_12.3.0-1ubuntu1~22.04.3_amd64.deb", "libgcc.deb",
    "d383e642d83263147f7b4b69fb92cf1036e5246c6be3accf10b77f986684589a"],
  ["https://archive.ubuntu.com/ubuntu/pool/main/libx/libxcrypt/libcrypt1_4.4.27-1_amd64.deb", "libcrypt.deb",
    "3fa566e9f861a08736cbc5a97562d9d6e4f0c00450fbeafcb6d7583423b04a98"],
];
const GLIBC_FILES = new Set([
  "ld-linux-x86-64.so.2",
  "libc.so.6",
  "libresolv.so.2",
  "libnss_dns.so.2",
  "libnss_files.so.2",
  "libgcc_s.so.1",
  "libcrypt.so.1",
  "libcrypt.so.1.1.0",
]);

function systemGlibc() {
  const files = ["/lib/x86_64-linux-gnu/libc.so.6", "/lib64/libc.so.6"];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const result = spawnSync(file, [], { encoding: "utf8", timeout: 4000 });
    const text = (result.stdout || "") + (result.stderr || "");
    const match = text.match(/release version (\d+)\.(\d+)/);
    if (match) return { major: Number(match[1]), minor: Number(match[2]) };
  }
  return null;
}

function needsBundledGlibc() {
  const found = systemGlibc();
  if (!found) return true;
  return found.major < 2 || (found.major === 2 && found.minor < 34);
}

function parseAr(buf) {
  if (buf.subarray(0, 8).toString("utf8") !== "!<arch>\n") throw new Error("فایل deb قابل خواندن نیست");
  const files = {};
  let offset = 8;
  while (offset + 60 <= buf.length) {
    const header = buf.subarray(offset, offset + 60).toString("latin1");
    offset += 60;
    const name = header.slice(0, 16).trim().replace(/\/$/, "");
    const size = parseInt(header.slice(48, 58).trim(), 10);
    if (!name || !Number.isFinite(size) || size < 0) break;
    files[name] = buf.subarray(offset, offset + size);
    offset += size + (size % 2);
  }
  return files;
}

function extractNeeded(tar, dest, wanted) {
  const saved = {};
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header[0] === 0) break;
    offset += 512;
    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const full = prefix ? prefix + "/" + rawName : rawName;
    const sizeText = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeText, 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const chunk = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    const base = full.split("/").pop();
    if (!wanted.has(base)) continue;
    if (type === "2") {
      const linkname = header.subarray(157, 257).toString("utf8").replace(/\0.*$/, "");
      if (linkname.startsWith("/")) continue;
      if (Buffer.isBuffer(saved[base])) continue;
      saved[base] = { link: linkname.split("/").pop() };
    } else if (type === "0" || type === "\0") {
      saved[base] = Buffer.from(chunk);
    }
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const name of Object.keys(saved)) {
    let value = saved[name];
    const seen = new Set();
    while (value && value.link) {
      if (seen.has(value.link)) break;
      seen.add(value.link);
      value = saved[value.link];
    }
    if (!Buffer.isBuffer(value) || value.length === 0) continue;
    const file = path.join(dest, name);
    fs.writeFileSync(file, value);
    fs.chmodSync(file, 0o755);
  }
}

async function ensureRuntime() {
  const loader = path.join(GLIBC_DIR, "ld-linux-x86-64.so.2");
  const mark = path.join(GLIBC_DIR, "ok");
  if (fs.existsSync(loader) && fs.existsSync(path.join(GLIBC_DIR, "libc.so.6")) && fs.existsSync(mark)) {
    state.loader = loader;
    state.libPath = GLIBC_DIR;
    return "cached";
  }
  state.status = "گلیبک کانتینر قدیمی است. کتابخانه سازگار یک بار دانلود می‌شود.";
  log(state.status);
  fs.mkdirSync(GLIBC_DIR, { recursive: true });
  const fzstd = loadFzstd();
  for (const [url, name, expected] of GLIBC_DEBS) {
    const dest = path.join(GLIBC_DIR, name);
    await download(url, dest); // HTTPS only: no plain-HTTP fallback any more
    const got = await sha256(dest);
    if (got !== expected) {
      fs.rmSync(dest, { force: true });
      throw new Error("هش " + name + " با مقدار پین‌شده یکی نیست؛ فایل رد شد.");
    }
    const members = parseAr(fs.readFileSync(dest));
    const packed = members["data.tar.zst"];
    if (!packed) throw new Error("data.tar.zst داخل " + name + " نیست");
    extractNeeded(Buffer.from(fzstd.decompress(packed)), GLIBC_DIR, GLIBC_FILES);
    fs.rmSync(dest, { force: true });
  }
  if (!fs.existsSync(loader) || !fs.existsSync(path.join(GLIBC_DIR, "libc.so.6")) || !fs.existsSync(path.join(GLIBC_DIR, "libresolv.so.2"))) {
    throw new Error("کتابخانه سازگار کامل استخراج نشد");
  }
  fs.writeFileSync(mark, "glibc-2.35\n");
  state.loader = loader;
  state.libPath = GLIBC_DIR;
  return "downloaded";
}

function binLaunch(args) {
  if (state.directExec || !state.loader) return { command: BIN, args: args };
  return {
    command: state.loader,
    args: ["--library-path", state.libPath, BIN].concat(args),
  };
}

const INTERP_OLD = "/lib64/ld-linux-x86-64.so.2";
// dropcache: tiny static x86-64 helper that asks the kernel to drop one file from the page cache.
// Source (assembled with: as + ld -static -nostdlib -z noseparate-code):
//   # dropcache - asks the kernel to drop the page cache of one file.
//   # usage: dropcache <path>   (exit 0 = ok, 1 = failed)
//   # equivalent to: fd = open(argv[1], O_RDONLY); posix_fadvise(fd, 0, 0, POSIX_FADV_DONTNEED);
//   .intel_syntax noprefix
//   .globl _start
//   .text
//   _start:
//       cmp  qword ptr [rsp], 2        # argc >= 2 ?
//       jb   fail
//       mov  rdi, [rsp+16]             # argv[1]
//       xor  esi, esi                  # O_RDONLY
//       mov  eax, 2                    # SYS_open
//       syscall
//       test rax, rax
//       js   fail
//       mov  edi, eax                  # fd
//       xor  esi, esi                  # offset = 0
//       xor  edx, edx                  # len = 0 (to EOF)
//       mov  r10d, 4                   # POSIX_FADV_DONTNEED
//       mov  eax, 221                  # SYS_fadvise64
//       syscall
//       test rax, rax
//       jnz  fail
//       xor  edi, edi
//       jmp  done
//   fail:
//       mov  edi, 1
//   done:
//       mov  eax, 231                  # SYS_exit_group
//       syscall
const FADVISE_B64 = "f0VMRgIBAQAAAAAAAAAAAAIAPgABAAAAeABAAAAAAABAAAAAAAAAANAAAAAAAAAAAAAAAEAAOAABAEAAAwACAAEAAAAFAAAAAAAAAAAAAAAAAEAAAAAAAAAAQAAAAAAAugAAAAAAAAC6AAAAAAAAAAAQAAAAAAAASIM8JAJyL0iLfCQQMfa4AgAAAA8FSIXAeByJxzH2MdJBugQAAAC43QAAAA8FSIXAdQQx/+sFvwEAAAC45wAAAA8FAC5zaHN0cnRhYgAudGV4dAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALAAAAAQAAAAYAAAAAAAAAeABAAAAAAAB4AAAAAAAAAEIAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAugAAAAAAAAARAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAA==";
const FADVISE_SHA = "03a1581761e94d1fe0853d3e0824b2bfca4fa5f783e6befe090198d321509230";

function shortLoaderPath() {
  const dest = path.join(VPN_DIR, "ld.so");
  return Buffer.byteLength(dest) <= INTERP_OLD.length ? dest : "";
}

function linkLoader() {
  const dest = shortLoaderPath();
  const src = path.join(GLIBC_DIR, "ld-linux-x86-64.so.2");
  if (!dest || !fs.existsSync(src)) return "";
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  return dest;
}

function patchInterpreter(file, loaderPath) {
  if (Buffer.byteLength(loaderPath) > INTERP_OLD.length) return false;
  const fd = fs.openSync(file, "r+");
  try {
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const window = buf.subarray(0, n);
    const have = window.indexOf(loaderPath);
    if (have >= 0) return false;
    const at = window.indexOf(INTERP_OLD);
    if (at < 0) throw new Error("مسیر لودر در باینری پیدا نشد");
    const next = Buffer.alloc(INTERP_OLD.length + 1);
    next.write(loaderPath);
    fs.writeSync(fd, next, 0, next.length, at);
    fs.fsyncSync(fd);
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

function ensureFadvise() {
  const file = path.join(VPN_DIR, "dropcache");
  let ok = false;
  try {
    ok = fs.existsSync(file) && crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === FADVISE_SHA;
  } catch (e) {}
  if (!ok) {
    // (re)write when missing or different, so an old/broken copy from a previous version gets replaced
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, Buffer.from(FADVISE_B64, "base64"));
    fs.chmodSync(file, 0o755);
  }
  return file;
}

function dropFileCache(file) {
  if (!file || !fs.existsSync(file)) return;
  try {
    const r = spawnSync(ensureFadvise(), [file], { timeout: 4000, stdio: "ignore" });
    if ((r.error || r.status !== 0) && !state.dropcacheWarned) {
      state.dropcacheWarned = true;
      log("پاک‌سازی کش فایل انجام نشد (مشکلی نیست، فقط مصرف رم کمی بیشتر می‌شود): " + (r.error ? r.error.message : "کد " + (r.status !== null ? r.status : r.signal)));
    }
  } catch (e) {
    if (!state.dropcacheWarned) {
      state.dropcacheWarned = true;
      log("پاک‌سازی کش فایل انجام نشد: " + e.message);
    }
  }
}

function trimGeo() {
  if (state.trimmed) return;
  state.trimmed = true;
  for (const name of ["geosite_RU.dat", "geoip_RU.dat", "geosite_IR.dat", "geoip_IR.dat"]) {
    try { fs.rmSync(path.join(BIN_DIR, name), { force: true }); } catch (e) {}
  }
  dropFileCache(BIN);
  dropFileCache(path.join(BIN_DIR, "xray-linux-amd64"));
  dropFileCache(path.join(BIN_DIR, "geoip.dat"));
  dropFileCache(path.join(BIN_DIR, "geosite.dat"));
  log("فایل‌های اضافی پاک شد تا دانلود و اجرا روی رم کم گیر نکند.");
}

function findBytes(fd, size, needle) {
  const overlap = needle.length - 1;
  let offset = 0;
  let prev = Buffer.alloc(0);
  while (offset < size) {
    const buf = Buffer.alloc(1024 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, offset);
    if (n <= 0) break;
    const window = prev.length ? Buffer.concat([prev, buf.subarray(0, n)]) : buf.subarray(0, n);
    const at = window.indexOf(needle);
    if (at >= 0) return offset - prev.length + at;
    prev = Buffer.from(window.subarray(Math.max(0, window.length - overlap)));
    offset += n;
  }
  return -1;
}

function patchBinary(file) {
  const patchedNeedle = Buffer.concat([PATCH_NEEDLE.subarray(0, PATCH_NEEDLE.length - 6), PATCH_JUMP]);
  const fd = fs.openSync(file, "r+");
  try {
    const size = fs.fstatSync(fd).size;
    if (findBytes(fd, size, patchedNeedle) >= 0) return false;
    const found = findBytes(fd, size, PATCH_NEEDLE);
    if (found < 0) throw new Error("الگوی requireRoot در این نسخه پیدا نشد. فقط v1.9.4 پشتیبانی می‌شود.");
    const jumpAt = found + PATCH_NEEDLE.length - 6;
    const cur = Buffer.alloc(6);
    fs.readSync(fd, cur, 0, 6, jumpAt);
    if (!cur.equals(PATCH_EXPECT)) throw new Error("بایت‌های بررسی روت با نسخه پین‌شده فرق دارد.");
    fs.writeSync(fd, PATCH_JUMP, 0, 6, jumpAt);
    fs.fsyncSync(fd);
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

async function ensureBinary() {
  if (fs.existsSync(BIN)) {
    const hashed = await sha256(BIN);
    const marked = fs.existsSync(MARK) ? fs.readFileSync(MARK, "utf8").trim() : "";
    if (marked && marked === hashed) return "cached";
    if (hashed === VPN_SHA) {
      patchBinary(BIN);
      fs.chmodSync(BIN, 0o755);
      fs.writeFileSync(MARK, await sha256(BIN));
      return "patched";
    }
    try {
      if (patchBinary(BIN) === false) {
        fs.chmodSync(BIN, 0o755);
        fs.writeFileSync(MARK, hashed);
        return "already-patched";
      }
    } catch (e) {
      log("باینری موجود قابل استفاده نیست و دوباره دانلود می‌شود: " + e.message);
    }
  }
  state.status = "در حال دانلود پنل v1.9.4، حدود ۳۳۰ مگابایت. این کار یک بار انجام می‌شود.";
  log(state.status);
  await download(VPN_URL, BIN);
  const got = await sha256(BIN);
  if (got !== VPN_SHA) {
    fs.rmSync(BIN, { force: true });
    throw new Error("هش دانلود با نسخه رسمی یکی نیست");
  }
  patchBinary(BIN);
  fs.chmodSync(BIN, 0o755);
  fs.writeFileSync(MARK, await sha256(BIN));
  return "downloaded";
}

function panelEnv(limit) {
  const env = Object.assign({}, process.env, {
    HOME: ROOT,
    VPNUI_DB_FOLDER: DATA,
    VPNUI_BIN_FOLDER: BIN_DIR,
    VPNUI_LOG_FOLDER: LOG_DIR,
    VPNUI_LOG_LEVEL: "info",
    NO_COLOR: "1",
    GOMAXPROCS: "1",
    GODEBUG: "madvdontneed=1",
  });
  env.MALLOC_ARENA_MAX = "1";
  if (limit >= 768 * 1024 * 1024 && limit < 8 * 1024 * 1024 * 1024) {
    env.GOMEMLIMIT = Math.floor(limit * 0.75 / (1024 * 1024)) + "MiB";
  } else if (limit >= 300 * 1024 * 1024 && limit < 768 * 1024 * 1024) {
    env.GOMEMLIMIT = Math.floor(limit * 0.7 / (1024 * 1024)) + "MiB";
  }
  return env;
}

function runBin(args, env, timeoutMs) {
  return new Promise((resolve) => {
    const launch = binLaunch(args);
    if (state.libPath) env.LD_LIBRARY_PATH = state.libPath;
    const child = spawn(launch.command, launch.args, { cwd: VPN_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, out });
    };
    const take = (buf) => {
      out += buf.toString("utf8");
      if (out.length > 20000) out = out.slice(-12000);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (err) => {
      out += err.message;
      finish(-1);
    });
    child.on("exit", (code) => finish(code));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      out += "\nTIMEOUT";
      finish(-1);
    }, timeoutMs || 90000);
  });
}

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function wgKeyPair() {
  const pair = crypto.generateKeyPairSync("x25519");
  const priv = pair.privateKey.export({ type: "pkcs8", format: "der" });
  const pub = pair.publicKey.export({ type: "spki", format: "der" });
  if (priv.length < 32 || pub.length < 32) throw new Error("کلید WireGuard ساخته نشد");
  return {
    secretKey: priv.subarray(priv.length - 32).toString("base64"),
    pubKey: pub.subarray(pub.length - 32).toString("base64"),
  };
}

function isPublicIp(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

function publicHostFromEnv() {
  const named = (process.env.PANEL_HOST || "").trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
  if (named) return named;
  const ip = (process.env.SERVER_IP || "").trim();
  if (isPublicIp(ip)) return ip;
  return "";
}

function fetchText(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "mf-panel-katabump" }, timeout: 8000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).href));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

async function detectPublicHost() {
  const known = publicHostFromEnv();
  if (known) return known;
  for (const url of ["https://api.ipify.org", "http://api.ipify.org", "https://icanhazip.com"]) {
    const ip = await fetchText(url);
    if (isPublicIp(ip)) return ip;
  }
  return "";
}

function formBody(fields) {
  return new URLSearchParams(fields).toString();
}

function panelRequest(method, urlPath, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: PANEL_PORT,
      method,
      path: urlPath,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body || ""),
        Cookie: cookie || "",
      },
      timeout: 20000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const jar = [];
        if (cookie) jar.push(cookie);
        for (const row of res.headers["set-cookie"] || []) jar.push(row.split(";")[0]);
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
          cookie: jar.filter(Boolean).join("; "),
        });
      });
    });
    req.on("error", (err) => {
      err.retry = true;
      reject(err);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { retry: true })));
    if (body) req.write(body);
    req.end();
  });
}

async function login(username, password) {
  const res = await panelRequest("POST", BASE + "/login", {
    body: formBody({ username, password }),
  });
  let parsed = {};
  try { parsed = JSON.parse(res.body); } catch (e) {}
  if (!parsed.success) {
    const err = new Error("ورود به پنل ناموفق: " + res.body.slice(0, 180));
    err.retry = false;
    throw err;
  }
  return res.cookie;
}

async function loginWhenReady(username, password) {
  let last = new Error("پنل برای ورود آماده نشد");
  for (let i = 0; i < 40; i++) {
    try {
      return await login(username, password);
    } catch (e) {
      last = e;
      if (!e.retry) break;
      await sleep(3000);
    }
  }
  throw last;
}

async function listInbounds(cookie) {
  const res = await panelRequest("GET", BASE + "/panel/api/inbounds/list", { cookie });
  let parsed = {};
  try { parsed = JSON.parse(res.body); } catch (e) {}
  if (!parsed.success) throw new Error("لیست اینباند ناموفق: " + res.body.slice(0, 180));
  return parsed.obj || [];
}

function asText(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function proxyField(host) {
  if (!host) return [];
  return [{ forceTls: "none", dest: host, port: PUBLIC_PORT, remark: "katabump" }];
}

function sniff() {
  return JSON.stringify({ enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false, routeOnly: false });
}

function stream(network, extra, host) {
  const body = Object.assign({ network: network, security: "none" }, extra || {});
  const proxy = proxyField(host);
  if (proxy.length) body.externalProxy = proxy;
  return JSON.stringify(body);
}

async function addInbound(cookie, spec) {
  const fields = {
    remark: spec.remark,
    enable: "true",
    listen: spec.listen || "127.0.0.1",
    port: String(spec.port),
    protocol: spec.protocol,
    settings: JSON.stringify(spec.settings),
    streamSettings: spec.stream || "{}",
    sniffing: spec.sniffing || sniff(),
    total: "0",
    expiryTime: "0",
  };
  const res = await panelRequest("POST", BASE + "/panel/api/inbounds/add", { cookie, body: formBody(fields) });
  let parsed = {};
  try { parsed = JSON.parse(res.body); } catch (e) {}
  if (!parsed.success) throw new Error(spec.remark + ": " + (parsed.msg || res.body.slice(0, 220)));
  return parsed.obj;
}

function plannedInbounds(host, keys) {
  const ssPassword = crypto.randomBytes(32).toString("base64");
  return [
    {
      remark: "VLESS-TCP",
      port: PORTS.vless,
      protocol: "vless",
      settings: { clients: [], decryption: "none", fallbacks: [{ dest: PORTS.trojan, xver: 0 }] },
      stream: stream("tcp", { tcpSettings: { acceptProxyProtocol: false, header: { type: "none" } } }, host),
    },
    {
      remark: "Trojan-TCP",
      port: PORTS.trojan,
      protocol: "trojan",
      settings: { clients: [], fallbacks: [{ dest: PORTS.ss, xver: 0 }] },
      stream: stream("tcp", { tcpSettings: { acceptProxyProtocol: false, header: { type: "none" } } }, host),
    },
    {
      remark: "Shadowsocks",
      port: PORTS.ss,
      protocol: "shadowsocks",
      settings: { method: "2022-blake3-aes-256-gcm", password: ssPassword, network: "tcp", ivCheck: false, clients: [] },
      stream: stream("tcp", { tcpSettings: { acceptProxyProtocol: false, header: { type: "none" } } }, host),
    },
    {
      remark: "VLESS-WS",
      port: PORTS.vlessWs,
      protocol: "vless",
      settings: { clients: [], decryption: "none" },
      stream: stream("ws", { wsSettings: { path: "/bp-vless", headers: {} } }, host),
    },
    {
      remark: "VMess-WS",
      port: PORTS.vmessWs,
      protocol: "vmess",
      settings: { clients: [] },
      stream: stream("ws", { wsSettings: { path: "/bp-vmess", headers: {} } }, host),
    },
    {
      remark: "Trojan-WS",
      port: PORTS.trojanWs,
      protocol: "trojan",
      settings: { clients: [] },
      stream: stream("ws", { wsSettings: { path: "/bp-trojan", headers: {} } }, host),
    },
    {
      remark: "VLESS-gRPC",
      port: PORTS.grpc,
      protocol: "vless",
      settings: { clients: [], decryption: "none" },
      stream: stream("grpc", { grpcSettings: { serviceName: "bpgrpc", multiMode: false } }, host),
    },
    {
      remark: "VLESS-HTTPUpgrade",
      port: PORTS.upgrade,
      protocol: "vless",
      settings: { clients: [], decryption: "none" },
      stream: stream("httpupgrade", { httpupgradeSettings: { path: "/bp-up", host: "" } }, host),
    },
    {
      remark: "WireGuard",
      listen: "0.0.0.0",
      port: PUBLIC_PORT,
      protocol: "wireguard",
      settings: {
        mtu: 1280,
        secretKey: keys.secretKey,
        pubKey: keys.pubKey,
        noKernelTun: true,
        address: ["10.10.0.1/32"],
        clientNetwork: "10.10.0.0/24",
        clients: [],
        peers: [],
      },
      stream: "{}",
      sniffing: "{}",
    },
  ];
}

function htmlEscape(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function writeAccess(info) {
  if (fs.existsSync(ACCESS)) {
    let text = fs.readFileSync(ACCESS, "utf8");
    let changed = false;
    if (info.host && text.includes("IP-سرور")) {
      text = text.split("IP-سرور").join(info.host);
      changed = true;
    }
    if (text.includes("ALIREZAPANEL") || text.includes("NF PANEL")) {
      text = text.split("ALIREZAPANEL").join(BRAND).split("NF PANEL").join(BRAND);
      changed = true;
    }
    const versionLine = "نسخه اجراکننده: " + VERSION;
    if (text.includes("نسخه اجراکننده:") && !text.includes(versionLine)) {
      text = text.replace(/نسخه اجراکننده: .*/, versionLine);
      changed = true;
    }
    if (changed) fs.writeFileSync(ACCESS, text);
    return;
  }
  const lines = [
    BRAND + " روی کاتابامپ",
    "نسخه اجراکننده: " + VERSION,
    "",
    "آدرس پنل مدیریت: http://" + (info.host || "IP-سرور") + ":" + PUBLIC_PORT + BASE + "/",
    "آدرس پرتال کاربران و ساب: http://" + (info.host || "IP-سرور") + ":" + PUBLIC_PORT + "/",
    "نام کاربری اولیه مدیر: " + info.username,
    "رمز اولیه مدیر: " + info.password,
    "",
    "اگر رمز را داخل پنل عوض کنید، همین فایل عوض نمی‌شود.",
    "کاربران می‌توانند از صفحه اصلی ثبت‌نام کرده و لینک سابسکریپشن خود را تحویل بگیرند.",
    "",
    "WireGuard قابل استفاده، اینباند WireGuard است نه WireGuard (C).",
    "اگر هندشیک وصل نشد، UDP پورت " + PUBLIC_PORT + " روی کاتابامپ باز نیست.",
  ];
  fs.writeFileSync(ACCESS, lines.join("\n") + "\n");
}

async function refreshLinks(cookie, host) {
  if (!host) return 0;
  const rows = await listInbounds(cookie);
  const managed = new Set(["VLESS-TCP", "Trojan-TCP", "Shadowsocks", "VLESS-WS", "VMess-WS", "Trojan-WS", "VLESS-gRPC", "VLESS-HTTPUpgrade"]);
  let changed = 0;
  for (const row of rows) {
    if (!managed.has(row.remark)) continue;
    let stream = {};
    try { stream = JSON.parse(asText(row.streamSettings) || "{}"); } catch (e) { stream = {}; }
    const current = Array.isArray(stream.externalProxy) ? (stream.externalProxy[0] || {}) : {};
    if (current.dest === host && Number(current.port) === PUBLIC_PORT && current.forceTls === "none") continue;
    stream.externalProxy = proxyField(host);
    const fields = {
      id: String(row.id),
      remark: row.remark || "",
      enable: row.enable ? "true" : "false",
      listen: row.listen || "",
      port: String(row.port),
      protocol: row.protocol,
      settings: asText(row.settings) || "{}",
      streamSettings: JSON.stringify(stream),
      sniffing: asText(row.sniffing) || "{}",
      total: String(row.total || 0),
      expiryTime: String(row.expiryTime || 0),
    };
    const res = await panelRequest("POST", BASE + "/panel/api/inbounds/update/" + row.id, {
      cookie,
      body: formBody(fields),
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body); } catch (e) {}
    if (!parsed.success) {
      log("به‌روزرسانی لینک " + row.remark + " ناموفق: " + (parsed.msg || res.body.slice(0, 160)));
      continue;
    }
    changed += 1;
  }
  return changed;
}

async function applyBrand(cookie) {
  try {
    const named = await panelRequest("POST", BASE + "/panel/api/server/serverName", {
      cookie,
      body: formBody({ serverName: BRAND }),
    });
    let parsed = {};
    try { parsed = JSON.parse(named.body); } catch (e) {}
    if (!parsed.success) log("نام رسمی پنل ذخیره نشد: " + named.body.slice(0, 180));
    else log("نام رسمی پنل: " + BRAND);
  } catch (e) {
    log("نام رسمی پنل ذخیره نشد: " + e.message);
  }
  try {
    const current = await panelRequest("POST", BASE + "/panel/setting/all", { cookie, body: "" });
    let parsed = {};
    try { parsed = JSON.parse(current.body); } catch (e) {}
    const obj = parsed.obj;
    if (!parsed.success || !obj || typeof obj !== "object" || Array.isArray(obj)) {
      log("عنوان ساب تنظیم نشد: " + current.body.slice(0, 160));
      return;
    }
    if (obj.subTitle === BRAND) return;
    if (Number(obj.webPort) !== PANEL_PORT || !panelBasePath(obj.webBasePath) || obj.webListen !== "127.0.0.1") {
      log("عنوان ساب دست نخورده ماند تا آدرس داخلی پنل عوض نشود.");
      return;
    }
    const fields = {};
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (value != null && typeof value === "object") {
        log("عنوان ساب دست نخورده ماند.");
        return;
      }
      fields[key] = value == null ? "" : String(value);
    }
    fields.subTitle = BRAND;
    const saved = await panelRequest("POST", BASE + "/panel/setting/update", {
      cookie,
      body: formBody(fields),
    });
    let result = {};
    try { result = JSON.parse(saved.body); } catch (e) {}
    if (!result.success) log("عنوان ساب ذخیره نشد: " + saved.body.slice(0, 180));
    else log("عنوان ساب: " + BRAND);
  } catch (e) {
    log("عنوان ساب ذخیره نشد: " + e.message);
  }
}

async function seed(username, password, host) {
  let cookie;
  try {
    cookie = await loginWhenReady(username, password);
  } catch (e) {
    if (username !== "admin" || password !== "admin") {
      log("ورود با رمز ذخیره‌شده نشد. admin/admin امتحان می‌شود.");
      cookie = await loginWhenReady("admin", "admin");
      username = "admin";
      password = "admin";
      writeState({ username, password, passwordReset: true });
    } else {
      throw e;
    }
  }
  state.adminCookie = cookie;
  await applyBrand(cookie);
  const existing = await listInbounds(cookie);
  const have = new Set(existing.map((row) => row.remark));
  const made = existing.map((row) => row.remark);
  const skipped = [];
  const keys = wgKeyPair();
  for (const spec of plannedInbounds(host, keys)) {
    if (have.has(spec.remark)) continue;
    try {
      await addInbound(cookie, spec);
      made.push(spec.remark);
      log("اینباند ساخته شد: " + spec.remark);
    } catch (e) {
      skipped.push(spec.remark + " (" + e.message + ")");
      log("اینباند ساخته نشد: " + e.message);
    }
  }
  const refreshed = await refreshLinks(cookie, host);
  if (refreshed) log("آدرس لینک‌ها به " + host + " به‌روز شد: " + refreshed);
  writeAccess({ host, username, password });
  await ensureAdminUser(password);
  await syncUsersToInbounds();
  return { made, skipped, username, password };
}


// -------------------------------------------------------------
// M&F Panel User & Subscription System
// -------------------------------------------------------------

function readUsers() {
  let raw;
  try {
    raw = fs.readFileSync(USERS_FILE, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e; // a read error must never look like "no users"
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  } catch (e) {
    // Never continue with an empty list: the next write would wipe every account.
    const aside = USERS_FILE + ".corrupt-" + Date.now();
    try { fs.renameSync(USERS_FILE, aside); } catch (err) {}
    log("فایل کاربران خراب بود و کنار گذاشته شد: " + aside + " (" + e.message + ")");
    try {
      const backup = JSON.parse(fs.readFileSync(USERS_FILE + ".bak", "utf8"));
      if (Array.isArray(backup)) {
        fs.copyFileSync(USERS_FILE + ".bak", USERS_FILE);
        log("کاربران از آخرین نسخه‌ی پشتیبان برگردانده شدند.");
        return backup;
      }
    } catch (err) {}
    return [];
  }
}

function writeUsers(users) {
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, USERS_FILE);
  // keep a copy of the last good version, used automatically if the main file ever gets corrupted
  try { fs.copyFileSync(USERS_FILE, USERS_FILE + ".bak", 0); fs.chmodSync(USERS_FILE + ".bak", 0o600); } catch (e) {}
}

// Serialises read-modify-write cycles on the users file (async hashing made races possible).
let usersLock = Promise.resolve();
function withUsersLock(fn) {
  const run = usersLock.then(fn);
  usersLock = run.catch(() => {});
  return run;
}

// Same scrypt parameters as before (N=16384, r=8, p=1, 32 bytes), so existing hashes keep working.
// At most 2 hashes run at once, so a burst of logins cannot starve the main thread on a 1-CPU host.
let scryptActive = 0;
const scryptQueue = [];
function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    const run = () => {
      scryptActive++;
      crypto.scrypt(password, salt, 32, (err, key) => {
        scryptActive--;
        const next = scryptQueue.shift();
        if (next) next();
        if (err) reject(err); else resolve(key);
      });
    };
    if (scryptActive < 2) run(); else scryptQueue.push(run);
  });
}

async function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt)).toString("hex");
  return { salt, hash };
}

const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
async function verifyPassword(password, user) {
  // Always do the same amount of work, even for unknown users (no timing hint about which names exist).
  const salt = user && user.salt ? user.salt : DUMMY_SALT;
  let computed;
  try { computed = (await scryptAsync(password, salt)).toString("hex"); } catch (e) { return false; }
  if (!user || !user.salt || !user.hash) return false;
  const a = Buffer.from(computed);
  const b = Buffer.from(String(user.hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isActive(user) {
  return !!user && (!user.status || user.status === "active");
}

// ---- simple in-memory rate limiter (sliding window) ----
const rateBuckets = new Map();

// Returns 0 when allowed, otherwise the number of seconds to wait.
function rateLimited(key, max, windowMs) {
  const list = rateBuckets.get(key);
  if (!list) return 0;
  const now = Date.now();
  while (list.length && now - list[0] >= windowMs) list.shift();
  if (!list.length) { rateBuckets.delete(key); return 0; }
  if (list.length < max) return 0;
  return Math.max(1, Math.ceil((windowMs - (now - list[0])) / 1000));
}

function rateRecord(key) {
  let list = rateBuckets.get(key);
  if (!list) {
    if (rateBuckets.size > 50000) rateBuckets.clear(); // hard memory cap
    list = [];
    rateBuckets.set(key, list);
  }
  list.push(Date.now());
  if (list.length > 1000) list.splice(0, list.length - 1000);
}

function rateReset(key) {
  rateBuckets.delete(key);
}

const rateSweeper = setInterval(() => {
  const cutoff = Date.now() - 3600 * 1000;
  for (const [key, list] of rateBuckets) {
    if (!list.length || list[list.length - 1] < cutoff) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);
if (rateSweeper.unref) rateSweeper.unref();

// The TCP splice hides the real client behind 127.0.0.1, so splice() remembers
// "local port of the upstream connection -> real client address" for the portal.
const clientAddrByPort = new Map();
function clientIp(req) {
  const mapped = clientAddrByPort.get(req.socket.remotePort);
  const raw = mapped || req.socket.remoteAddress || "unknown";
  return String(raw).replace(/^::ffff:/, "");
}

// ---- registration policy ----
function noteRegistration() {
  try {
    const line = "حالت ثبت\u200cنام: " + (REGISTRATION === "open" ? "باز (بدون کد)" : "بسته");
    const text = fs.existsSync(ACCESS) ? fs.readFileSync(ACCESS, "utf8") : "";
    // also replaces a line left behind by an older version of this file
    const re = /^(کد دعوت ثبت\u200cنام|حالت ثبت\u200cنام): .*$/m;
    const next = re.test(text) ? text.replace(re, line) : text.replace(/\n*$/, "\n") + line + "\n";
    if (next !== text) fs.writeFileSync(ACCESS, next);
  } catch (e) {
    log("نوشتن وضعیت ثبت\u200cنام در PANEL.txt ناموفق: " + e.message);
  }
}

// Limits for one user, in the units the panel expects (totalGB is BYTES, expiryTime is epoch ms; 0 = none).
function clientLimits(u) {
  const totalGB = Math.round((Number(u.trafficLimitGb) || 0) * 1024 * 1024 * 1024);
  const t = u.expiresAt ? Date.parse(u.expiresAt) : 0;
  return { totalGB, expiryTime: Number.isFinite(t) && t > 0 ? t : 0, enable: isActive(u) };
}

// The panel requires every client e-mail to be unique across ALL inbounds. The old code used the plain username
// everywhere, so only the first inbound ever accepted the user (the others were rejected, silently).
function emailFor(u, row) {
  const slug = String(row.remark || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "inbound-" + row.id;
  return u.username + "-" + slug;
}

function getSessionSecret() {
  if (state.sessionSecret) return state.sessionSecret;
  const s = readState();
  if (s.sessionSecret) {
    state.sessionSecret = s.sessionSecret;
  } else {
    state.sessionSecret = crypto.randomBytes(32).toString("hex");
    writeState({ sessionSecret: state.sessionSecret });
  }
  return state.sessionSecret;
}

function makeSessionToken(username) {
  const secret = getSessionSecret();
  const expires = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp: expires })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return payload + "." + sig;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const secret = getSessionSecret();
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > data.exp) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

function findUser(username) {
  const users = readUsers();
  return users.find((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());
}

function findUserByToken(token) {
  if (!token) return null;
  const users = readUsers();
  return users.find((u) => u.subToken === token);
}

async function createUser(username, password, role) {
  const trimmed = String(username == null ? "" : username).trim();
  if (trimmed.length < 3 || trimmed.length > 32) throw new Error("نام کاربری باید بین ۳ تا ۳۲ نویسه باشد.");
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(trimmed)) throw new Error("نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، خط تیره و نقطه باشد.");
  if (!role && ["admin", "administrator", "root"].includes(trimmed.toLowerCase())) throw new Error("این نام کاربری رزرو شده است.");
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) throw new Error("رمز عبور باید حداقل " + faDigits(MIN_PASSWORD_LENGTH) + " نویسه باشد.");
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error("رمز عبور خیلی طولانی است.");

  const { salt, hash } = await hashPassword(password); // heavy part stays outside the lock
  return withUsersLock(() => {
    const users = readUsers();
    if (users.some((u) => u.username.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error("این نام کاربری قبلاً ثبت شده است.");
    }
    const now = Date.now();
    const user = {
      id: crypto.randomUUID(),
      username: trimmed,
      salt,
      hash,
      subToken: crypto.randomBytes(12).toString("hex"),
      createdAt: new Date(now).toISOString(),
      status: "active",
      role: role || "user",
      trafficLimitGb: USER_TRAFFIC_GB,
      usedTrafficBytes: 0,
      expiresAt: USER_EXPIRY_DAYS ? new Date(now + USER_EXPIRY_DAYS * 86400000).toISOString() : null,
    };
    users.push(user);
    writeUsers(users);
    return user;
  });
}

async function ensureAdminUser(adminPassword) {
  const { salt, hash } = await hashPassword(adminPassword);
  return withUsersLock(() => {
    const users = readUsers();
    let admin = users.find((u) => u.username.toLowerCase() === "admin");
    if (!admin) {
      admin = {
        id: crypto.randomUUID(),
        username: "admin",
        salt,
        hash,
        subToken: crypto.randomBytes(12).toString("hex"),
        createdAt: new Date().toISOString(),
        status: "active",
        role: "admin",
        trafficLimitGb: 0,
        usedTrafficBytes: 0,
        expiresAt: null,
      };
      users.push(admin);
    } else {
      admin.salt = salt;
      admin.hash = hash;
      admin.role = "admin";
    }
    writeUsers(users);
    return admin;
  });
}

async function getAdminCookie() {
  if (state.adminCookie) return state.adminCookie;
  const saved = readState();
  const username = saved.username || "admin";
  const password = saved.password || "admin";
  try {
    state.adminCookie = await login(username, password);
    return state.adminCookie;
  } catch (e) {
    return null;
  }
}

// Runs one sync at a time (concurrent runs could add the same client twice).
let syncChain = Promise.resolve();
function syncUsersToInbounds() {
  const run = syncChain.then(syncUsersToInboundsNow);
  syncChain = run.catch(() => {});
  return run;
}

async function syncUsersToInboundsNow() {
  try {
    const cookie = await getAdminCookie();
    if (!cookie) return;
    const rows = await listInbounds(cookie);
    const users = readUsers();
    if (!users.length) return;

    for (const row of rows) {
      if (!["vless", "vmess", "trojan"].includes(row.protocol)) continue;
      let settings = {};
      try { settings = JSON.parse(asText(row.settings) || "{}"); } catch (e) { settings = {}; }
      if (!Array.isArray(settings.clients)) settings.clients = [];

      let changed = false;
      for (const u of users) {
        const limits = clientLimits(u);
        if (row.protocol === "vless" || row.protocol === "vmess") {
          const exists = settings.clients.some((c) => c.id === u.id || c.email === u.username || c.email === emailFor(u, row));
          if (!exists) {
            settings.clients.push({
              id: u.id,
              alterId: 0,
              email: emailFor(u, row),
              limitIp: 0,
              totalGB: limits.totalGB,
              expiryTime: limits.expiryTime,
              enable: limits.enable,
              tgId: "",
              subId: u.subToken,
              flow: "",
            });
            changed = true;
          }
        } else if (row.protocol === "trojan") {
          const exists = settings.clients.some((c) => c.password === u.id || c.email === u.username || c.email === emailFor(u, row));
          if (!exists) {
            settings.clients.push({
              password: u.id,
              email: emailFor(u, row),
              limitIp: 0,
              totalGB: limits.totalGB,
              expiryTime: limits.expiryTime,
              enable: limits.enable,
              tgId: "",
              subId: u.subToken,
            });
            changed = true;
          }
        }
      }

      if (changed) {
        const stream = asText(row.streamSettings) || "{}";
        const fields = {
          id: String(row.id),
          remark: row.remark || "",
          enable: row.enable ? "true" : "false",
          listen: row.listen || "",
          port: String(row.port),
          protocol: row.protocol,
          settings: JSON.stringify(settings),
          streamSettings: stream,
          sniffing: asText(row.sniffing) || "{}",
          total: String(row.total || 0),
          expiryTime: String(row.expiryTime || 0),
        };
        const resp = await panelRequest("POST", BASE + "/panel/api/inbounds/update/" + row.id, {
          cookie,
          body: formBody(fields),
        });
        let result = {};
        try { result = JSON.parse(resp.body); } catch (e) {}
        if (resp.status === 200 && result.success) log("کاربران در اینباند " + row.remark + " به‌روز شدند.");
        else log("به‌روزرسانی کاربران در اینباند " + row.remark + " رد شد: " + (result.msg || resp.body.slice(0, 160)));
      }
    }
  } catch (e) {
    log("همگام‌سازی کاربران با اینباندها ناموفق: " + e.message);
  }
}

function generateUserConfigs(user, host, port) {
  const h = host || state.publicHost || publicHostFromEnv() || "127.0.0.1";
  const p = port || PUBLIC_PORT;
  const uuid = user.id;

  const vlessWs = `vless://${uuid}@${h}:${p}?path=%2Fbp-vless&security=none&encryption=none&type=ws#${encodeURIComponent(BRAND + ' - VLESS WS')}`;

  const vmessObj = {
    v: "2",
    ps: `${BRAND} - VMess WS`,
    add: h,
    port: String(p),
    id: uuid,
    aid: "0",
    scy: "auto",
    net: "ws",
    type: "none",
    host: "",
    path: "/bp-vmess",
    tls: "none",
    sni: "",
    alpn: ""
  };
  const vmessWs = "vmess://" + Buffer.from(JSON.stringify(vmessObj)).toString("base64");

  const trojanWs = `trojan://${uuid}@${h}:${p}?path=%2Fbp-trojan&security=none&type=ws#${encodeURIComponent(BRAND + ' - Trojan WS')}`;

  const vlessTcp = `vless://${uuid}@${h}:${p}?security=none&encryption=none&type=tcp#${encodeURIComponent(BRAND + ' - VLESS TCP')}`;

  const vlessUp = `vless://${uuid}@${h}:${p}?path=%2Fbp-up&security=none&encryption=none&type=httpupgrade#${encodeURIComponent(BRAND + ' - HTTPUpgrade')}`;

  const vlessGrpc = `vless://${uuid}@${h}:${p}?serviceName=bpgrpc&security=none&encryption=none&type=grpc#${encodeURIComponent(BRAND + ' - gRPC')}`;

  return [
    {
      id: "vless-ws",
      name: "VLESS WebSocket",
      badge: "پیشنهادی (کلودفلر)",
      type: "vless",
      uri: vlessWs,
      desc: "بهترین گزینه برای عبور از فیلترینگ و اینترنت ملی با پورت مستقیم",
      path: "/bp-vless",
      port: p,
    },
    {
      id: "vmess-ws",
      name: "VMess WebSocket",
      badge: "سازگاری بالا",
      type: "vmess",
      uri: vmessWs,
      desc: "سازگار با تمامی نسخه‌های قدیمی و جدید کلاینت‌های V2Ray",
      path: "/bp-vmess",
      port: p,
    },
    {
      id: "trojan-ws",
      name: "Trojan WebSocket",
      badge: "امنیت بالا",
      type: "trojan",
      uri: trojanWs,
      desc: "رمزنگاری تروجان با کانال WebSocket برای ثبات اتصال",
      path: "/bp-trojan",
      port: p,
    },
    {
      id: "vless-tcp",
      name: "VLESS TCP",
      badge: "حداکثر سرعت",
      type: "vless",
      uri: vlessTcp,
      desc: "بدون لایه وب‌سوکت برای سرعت بالا و پینگ کمتر در استریم و دانلود",
      path: "-",
      port: p,
    },
    {
      id: "vless-up",
      name: "VLESS HTTPUpgrade",
      badge: "بهینه‌شده",
      type: "vless",
      uri: vlessUp,
      desc: "پروتکل مدرن HTTP Upgrade با تاخیر کم",
      path: "/bp-up",
      port: p,
    },
    {
      id: "vless-grpc",
      name: "VLESS gRPC",
      badge: "گیمینگ",
      type: "vless",
      uri: vlessGrpc,
      desc: "مالتی‌پلکس gRPC برای پینگ پایدار در بازی‌ها و وبگردی",
      path: "service: bpgrpc",
      port: p,
    },
  ];
}

function generateSubscriptionPayload(user, host, port) {
  const configs = generateUserConfigs(user, host, port);
  const uris = configs.map((c) => c.uri).join("\n");
  return Buffer.from(uris).toString("base64");
}

// -------------------------------------------------------------
// Pure JavaScript SVG QR Code Generator (Zero-Dependency)
// -------------------------------------------------------------
function createQRCode(text, correctLevel) {
  correctLevel = correctLevel || 1;
  function QR8bitByte(data) {
    this.mode = 4;
    this.data = data;
    this.parsedData = [];
    for (let i = 0, l = data.length; i < l; i++) {
      const byteArray = [];
      const code = data.charCodeAt(i);
      if (code > 0x10000) {
        byteArray[0] = 0xF0 | ((code & 0x1C0000) >>> 18);
        byteArray[1] = 0x80 | ((code & 0x3F000) >>> 12);
        byteArray[2] = 0x80 | ((code & 0xFC0) >>> 6);
        byteArray[3] = 0x80 | (code & 0x3F);
      } else if (code > 0x800) {
        byteArray[0] = 0xE0 | ((code & 0xF000) >>> 12);
        byteArray[1] = 0x80 | ((code & 0xFC0) >>> 6);
        byteArray[2] = 0x80 | (code & 0x3F);
      } else if (code > 0x80) {
        byteArray[0] = 0xC0 | ((code & 0x7C0) >>> 6);
        byteArray[1] = 0x80 | (code & 0x3F);
      } else {
        byteArray[0] = code;
      }
      this.parsedData.push.apply(this.parsedData, byteArray);
    }
  }
  QR8bitByte.prototype = {
    getLength: function() { return this.parsedData.length; },
    write: function(buffer) {
      for (let i = 0; i < this.parsedData.length; i++) buffer.put(this.parsedData[i], 8);
    }
  };

  const QRRSBlock = {
    RS_BLOCK_TABLE: [
      [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
      [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
      [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
      [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
      [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
      [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
      [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
      [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
      [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
      [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
      [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
      [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
      [4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
      [3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13]
    ],
    getRSBlocks: function(typeNumber, errorCorrectLevel) {
      const rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
      if (!rsBlock) throw new Error("bad rs block: " + typeNumber);
      const length = rsBlock.length / 3;
      const list = [];
      for (let i = 0; i < length; i++) {
        const count = rsBlock[i * 3 + 0];
        const totalCount = rsBlock[i * 3 + 1];
        const dataCount = rsBlock[i * 3 + 2];
        for (let j = 0; j < count; j++) list.push({ totalCount: totalCount, dataCount: dataCount });
      }
      return list;
    },
    getRsBlockTable: function(typeNumber, errorCorrectLevel) {
      switch (errorCorrectLevel) {
        case 1: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case 0: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case 3: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case 2: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default: return undefined;
      }
    }
  };

  const QRBitBuffer = function() {
    this.buffer = [];
    this.length = 0;
  };
  QRBitBuffer.prototype = {
    get: function(index) {
      const bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
    },
    put: function(num, length) {
      for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    },
    putBit: function(bit) {
      const bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
      this.length++;
    }
  };

  const QRMath = {
    glog: function(n) {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: function(n) {
      while (n < 0) n += 255;
      while (n >= 255) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };
  for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

  function QRPolynomial(num, shift) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (let i = num.length - offset; i < this.num.length; i++) this.num[i] = 0;
  }
  QRPolynomial.prototype = {
    get: function(index) { return this.num[index]; },
    getLength: function() { return this.num.length; },
    multiply: function(e) {
      const num = new Array(this.getLength() + e.getLength() - 1);
      for (let i = 0; i < this.getLength() + e.getLength() - 1; i++) num[i] = 0;
      for (let i = 0; i < this.getLength(); i++) {
        for (let j = 0; j < e.getLength(); j++) num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
      }
      return new QRPolynomial(num, 0);
    },
    mod: function(e) {
      if (this.getLength() - e.getLength() < 0) return this;
      const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      const num = new Array(this.getLength());
      for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
      for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
      return new QRPolynomial(num, 0).mod(e);
    }
  };

  const QRUtil = {
    PATTERN_POSITION_TABLE: [
      [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
      [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
      [6, 32, 58], [6, 34, 62], [6, 26, 46, 66]
    ],
    G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo: function(data) {
      let d = data << 10;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
        d ^= QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15));
      }
      return ((data << 10) | d) ^ QRUtil.G15_MASK;
    },
    getBCHDigit: function(data) {
      let digit = 0;
      while (data !== 0) { digit++; data >>>= 1; }
      return digit;
    },
    getPatternPosition: function(typeNumber) {
      return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1] || [];
    },
    getMask: function(maskPattern, i, j) {
      switch (maskPattern) {
        case 0: return (i + j) % 2 === 0;
        case 1: return i % 2 === 0;
        case 2: return j % 3 === 0;
        case 3: return (i + j) % 3 === 0;
        case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
        case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
        case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
        default: throw new Error("bad mask");
      }
    },
    getErrorFactoryPolynomial: function(errorCorrectLength) {
      let a = new QRPolynomial([1], 0);
      for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      return a;
    },
    getLengthInBits: function(mode, type) {
      if (1 <= type && type < 10) {
        switch (mode) { case 1: return 10; case 2: return 9; case 4: return 8; case 8: return 8; default: return 8; }
      } else if (type < 27) {
        switch (mode) { case 1: return 12; case 2: return 11; case 4: return 16; case 8: return 10; default: return 8; }
      } else {
        switch (mode) { case 1: return 14; case 2: return 13; case 4: return 16; case 8: return 12; default: return 8; }
      }
    },
    getLostPoint: function(qrCode) {
      const moduleCount = qrCode.getModuleCount();
      let lostPoint = 0;
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          let sameCount = 0;
          const dark = qrCode.isDark(row, col);
          for (let r = -1; r <= 1; r++) {
            if (row + r < 0 || moduleCount <= row + r) continue;
            for (let c = -1; c <= 1; c++) {
              if (col + c < 0 || moduleCount <= col + c) continue;
              if (r === 0 && c === 0) continue;
              if (dark === qrCode.isDark(row + r, col + c)) sameCount++;
            }
          }
          if (sameCount > 5) lostPoint += 3 + sameCount - 5;
        }
      }
      return lostPoint;
    }
  };

  function QRCodeModel(typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }
  QRCodeModel.prototype = {
    addData: function(data) {
      this.dataList.push(new QR8bitByte(data));
      this.dataCache = null;
    },
    isDark: function(row, col) { return this.modules[row][col]; },
    getModuleCount: function() { return this.moduleCount; },
    make: function() {
      if (this.typeNumber < 1) {
        let typeNumber = 1;
        for (; typeNumber < 40; typeNumber++) {
          const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
          const buffer = new QRBitBuffer();
          let totalDataCount = 0;
          for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
          for (let i = 0; i < this.dataList.length; i++) {
            const data = this.dataList[i];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
            data.write(buffer);
          }
          if (buffer.length <= totalDataCount * 8) break;
        }
        this.typeNumber = typeNumber;
      }
      this.makeImpl(false, this.getBestMaskPattern());
    },
    makeImpl: function(test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = new Array(this.moduleCount);
      for (let row = 0; row < this.moduleCount; row++) {
        this.modules[row] = new Array(this.moduleCount);
        for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
      }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern();
      this.setupTimingPattern();
      this.setupTypeInfo(test, maskPattern);
      if (this.dataCache == null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
      this.mapData(this.dataCache, maskPattern);
    },
    setupPositionProbePattern: function(row, col) {
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          if ((0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    getBestMaskPattern: function() {
      let minLostPoint = 0;
      let pattern = 0;
      for (let i = 0; i < 8; i++) {
        this.makeImpl(true, i);
        const lostPoint = QRUtil.getLostPoint(this);
        if (i === 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    },
    setupTimingPattern: function() {
      for (let r = 8; r < this.moduleCount - 8; r++) {
        if (this.modules[r][6] !== null) continue;
        this.modules[r][6] = r % 2 === 0;
      }
      for (let c = 8; c < this.moduleCount - 8; c++) {
        if (this.modules[6][c] !== null) continue;
        this.modules[6][c] = c % 2 === 0;
      }
    },
    setupPositionAdjustPattern: function() {
      const pos = QRUtil.getPatternPosition(this.typeNumber);
      for (let i = 0; i < pos.length; i++) {
        for (let j = 0; j < pos.length; j++) {
          const row = pos[i];
          const col = pos[j];
          if (this.modules[row][col] !== null) continue;
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
                this.modules[row + r][col + c] = true;
              } else {
                this.modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    },
    setupTypeInfo: function(test, maskPattern) {
      const data = (this.errorCorrectLevel << 3) | maskPattern;
      const bits = QRUtil.getBCHTypeInfo(data);
      for (let i = 0; i < 15; i++) {
        const mod = !test && ((bits >> i) & 1) === 1;
        if (i < 6) this.modules[i][8] = mod;
        else if (i < 8) this.modules[i + 1][8] = mod;
        else this.modules[this.moduleCount - 15 + i][8] = mod;
      }
      for (let i = 0; i < 15; i++) {
        const mod = !test && ((bits >> i) & 1) === 1;
        if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
        else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
        else this.modules[8][15 - i - 1] = mod;
      }
      this.modules[this.moduleCount - 8][8] = !test;
    },
    mapData: function(data, maskPattern) {
      let inc = -1;
      let row = this.moduleCount - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      for (let col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (this.modules[row][col - c] === null) {
              let dark = false;
              if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
              const mask = QRUtil.getMask(maskPattern, row, col - c);
              if (mask) dark = !dark;
              this.modules[row][col - c] = dark;
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
  };

  QRCodeModel.createData = function(typeNumber, errorCorrectLevel, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    const buffer = new QRBitBuffer();
    for (let i = 0; i < dataList.length; i++) {
      const data = dataList[i];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
    if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    while (true) {
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(0xEC, 8);
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(0x11, 8);
    }
    return QRCodeModel.createBytes(buffer, rsBlocks);
  };

  QRCodeModel.createBytes = function(buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xFF & buffer.buffer[i + offset];
      offset += dcCount;
      const rsPoly = QRUtil.getErrorFactoryPolynomial(ecCount);
      const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }
    const data = [];
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) data.push(dcdata[r][i]);
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) data.push(ecdata[r][i]);
      }
    }
    return data;
  };

  const model = new QRCodeModel(0, correctLevel);
  model.addData(text);
  model.make();
  return model;
}

function qrToSvg(qr, cellSize, margin) {
  cellSize = cellSize || 6;
  margin = margin || 4;
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * cellSize;
  let paths = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        paths += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%"><rect width="${size}" height="${size}" fill="#ffffff" rx="10"/><path d="${paths}" fill="#000000"/></svg>`;
}


// The dashboard page also needs the QR generator in the BROWSER. The page template inserts ${QR_CODE_JS},
// but that constant did not exist, so every visit to /sub threw a ReferenceError (and crashed the process).
// The two functions are self-contained, so Function#toString gives a complete, working copy of their source.
const QR_CODE_JS = [createQRCode, qrToSvg].map((fn) => fn.toString()).join("\n\n");

// -------------------------------------------------------------
// HTML Page Renderers (Auth Page & Subs Dashboard)
// -------------------------------------------------------------

const MF_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="132 95 990 1035" role="img" aria-label="M&amp;F Panel"><defs>
  <linearGradient id="mfSteel" gradientUnits="userSpaceOnUse" x1="260" y1="190" x2="1000" y2="940">
    <stop offset="0" stop-color="#fbfbfb"/><stop offset=".22" stop-color="#d4d4d4"/><stop offset=".42" stop-color="#8f8f8f"/>
    <stop offset=".6" stop-color="#d9d9d9"/><stop offset=".8" stop-color="#7d7d7d"/><stop offset="1" stop-color="#3f3f3f"/></linearGradient>
  <linearGradient id="mfSteelM" gradientUnits="userSpaceOnUse" x1="360" y1="370" x2="620" y2="810">
    <stop offset="0" stop-color="#f2f2f2"/><stop offset=".22" stop-color="#a9a9a9"/><stop offset=".5" stop-color="#4a4a4a"/><stop offset=".78" stop-color="#8d8d8d"/><stop offset="1" stop-color="#d6d6d6"/></linearGradient>
  <linearGradient id="mfSteelF" gradientUnits="userSpaceOnUse" x1="640" y1="370" x2="900" y2="800">
    <stop offset="0" stop-color="#f4f4f4"/><stop offset=".3" stop-color="#b4b4b4"/><stop offset=".6" stop-color="#555"/><stop offset=".85" stop-color="#9a9a9a"/><stop offset="1" stop-color="#d0d0d0"/></linearGradient>
  <linearGradient id="mfRoofL" gradientUnits="userSpaceOnUse" x1="478" y1="265" x2="493" y2="296"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d2d2d2"/><stop offset=".65" stop-color="#8a8a8a"/><stop offset="1" stop-color="#474747"/></linearGradient>
  <linearGradient id="mfRoofR" gradientUnits="userSpaceOnUse" x1="776" y1="265" x2="761" y2="296"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".3" stop-color="#b8b8b8"/><stop offset=".65" stop-color="#6c6c6c"/><stop offset="1" stop-color="#2e2e2e"/></linearGradient>
  <linearGradient id="mfBotL" gradientUnits="userSpaceOnUse" x1="510" y1="815" x2="491" y2="845"><stop offset="0" stop-color="#e9e9e9"/><stop offset=".16" stop-color="#a2a2a2"/><stop offset=".42" stop-color="#555"/><stop offset="1" stop-color="#171717"/></linearGradient>
  <linearGradient id="mfBotR" gradientUnits="userSpaceOnUse" x1="744" y1="815" x2="763" y2="845"><stop offset="0" stop-color="#dcdcdc"/><stop offset=".16" stop-color="#939393"/><stop offset=".42" stop-color="#4a4a4a"/><stop offset="1" stop-color="#151515"/></linearGradient>
  <linearGradient id="mfLitL" gradientUnits="userSpaceOnUse" x1="340" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".55" stop-color="#bcbcbc"/><stop offset="1" stop-color="#7c7c7c"/></linearGradient>
  <linearGradient id="mfLitR" gradientUnits="userSpaceOnUse" x1="914" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#e8e8e8"/><stop offset=".55" stop-color="#a6a6a6"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfSideL" gradientUnits="userSpaceOnUse" x1="306" y1="0" x2="330" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSideR" gradientUnits="userSpaceOnUse" x1="948" y1="0" x2="924" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSteelV" gradientUnits="userSpaceOnUse" x1="0" y1="958" x2="0" y2="1052">
    <stop offset="0" stop-color="#f6f6f6"/><stop offset=".4" stop-color="#b3b3b3"/><stop offset=".52" stop-color="#6e6e6e"/><stop offset=".8" stop-color="#3a3a3a"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfLock" gradientUnits="userSpaceOnUse" x1="568" y1="300" x2="684" y2="420">
    <stop offset="0" stop-color="#e6e6e6"/><stop offset=".45" stop-color="#8a8a8a"/><stop offset="1" stop-color="#3c3c3c"/></linearGradient>
  <linearGradient id="mfSteelR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8d8d8"/><stop offset=".5" stop-color="#6e6e6e"/><stop offset="1" stop-color="#1e1e1e"/></linearGradient>
  <radialGradient id="mfSphere" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".3" stop-color="#ee1c1c"/><stop offset=".75" stop-color="#8a0a0a"/><stop offset="1" stop-color="#3a0000"/></radialGradient>
  <radialGradient id="mfGlowNode"><stop offset=".45" stop-color="#ff2a2a" stop-opacity=".75"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfAura" cx="627" cy="545" r="430" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff1f1f" stop-opacity=".30"/><stop offset=".55" stop-color="#b30000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfInner" cx="627" cy="560" r="330" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2a0508"/><stop offset="1" stop-color="#060102"/></radialGradient>
  <linearGradient id="mfRedFace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfRedFaceR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2a2a" stop-opacity="0"/><stop offset=".5" stop-color="#ff3a3a"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfSweepG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfArcFade" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="950" y2="0"><stop offset="0" stop-color="#e8e8e8" stop-opacity=".1"/><stop offset=".5" stop-color="#f4f4f4"/><stop offset="1" stop-color="#e8e8e8" stop-opacity=".1"/></linearGradient>
  <pattern id="mfBrush" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
    <rect width="6" height="1.2" fill="#fff" opacity=".14"/><rect y="3" width="6" height="1" fill="#000" opacity=".16"/></pattern>
  <filter id="mfBlur2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="mfBlur5" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="mfBlur25" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="25"/></filter>
  <filter id="mfBlur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <clipPath id="mfMetalClip">
  <path clip-rule="evenodd" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
  <polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616"/><polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801"/><polygon points="568,298 684,298 684,376 626,425 568,376"/>
  <path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z"/><path clip-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z"/>
</clipPath>
</defs>

<g class="mf-smoke" filter="url(#mfBlur25)" opacity=".9">
  <ellipse cx="300" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/><ellipse cx="960" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/>
  <ellipse cx="330" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/><ellipse cx="930" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/>
</g>
<circle class="mf-aura" cx="627" cy="545" r="430" fill="url(#mfAura)"/>

<!-- constellation behind the shield -->
<g stroke="#ff3a3a" stroke-width="1.4" opacity=".55" fill="none">
<line x1="627" y1="150" x2="505" y2="268"/><line x1="627" y1="150" x2="742" y2="238"/><line x1="742" y1="238" x2="812" y2="300"/><line x1="812" y1="300" x2="925" y2="350"/><line x1="505" y1="268" x2="331" y2="350"/><line x1="870" y1="520" x2="925" y2="350"/><line x1="870" y1="520" x2="917" y2="728"/><line x1="378" y1="520" x2="331" y2="350"/><line x1="378" y1="520" x2="347" y2="722"/><line x1="470" y1="600" x2="378" y2="520"/><line x1="690" y1="640" x2="870" y2="520"/><line x1="560" y1="700" x2="470" y2="600"/><line x1="560" y1="700" x2="690" y2="640"/><line x1="505" y1="268" x2="627" y2="330"/><line x1="742" y1="238" x2="627" y2="330"/><line x1="470" y1="600" x2="550" y2="430"/><line x1="690" y1="640" x2="700" y2="450"/>
</g>
<g><path class="mf-spark" d="M505 253 L507.7 265.3 L520 268 L507.7 270.7 L505 283 L502.3 270.7 L490 268 L502.3 265.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M742 223 L744.7 235.3 L757 238 L744.7 240.7 L742 253 L739.3 240.7 L727 238 L739.3 235.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M812 285 L814.7 297.3 L827 300 L814.7 302.7 L812 315 L809.3 302.7 L797 300 L809.3 297.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M870 505 L872.7 517.3 L885 520 L872.7 522.7 L870 535 L867.3 522.7 L855 520 L867.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M378 505 L380.7 517.3 L393 520 L380.7 522.7 L378 535 L375.3 522.7 L363 520 L375.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M560 685 L562.7 697.3 L575 700 L562.7 702.7 L560 715 L557.3 702.7 L545 700 L557.3 697.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M690 625 L692.7 637.3 L705 640 L692.7 642.7 L690 655 L687.3 642.7 L675 640 L687.3 637.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M470 585 L472.7 597.3 L485 600 L472.7 602.7 L470 615 L467.3 602.7 L455 600 L467.3 597.3Z" fill="#ff5a4a"/></g>

<!-- orbit ring -->
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff2a2a" stroke-width="2" opacity=".55" filter="url(#mfBlur2)"/>
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff4a3a" stroke-width="1.3" opacity=".8"/>
<circle cx="627" cy="505" r="352" fill="none" stroke="#d9d9d9" stroke-width="2.2" opacity=".55"/>
<path d="M328.5 318.5 A352 352 0 0 1 553.8 160.7" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<path d="M700.2 160.7 A352 352 0 0 1 925.5 318.5" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<g class="mf-spin"><path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#ff6a5a" stroke-width="4.5" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#fff3f0" stroke-width="2" stroke-linecap="round"/></g>
<g class="mf-spin rev"><path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ff4a3a" stroke-width="3" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ffd0c8" stroke-width="1.4" stroke-linecap="round"/></g>

<!-- shield interior + frame -->
<polygon points="627,236 900,364 925,380 926,520 914,600 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650 340,600 329,520 329,380 354,364" fill="url(#mfInner)"/>
<g stroke="#ff3a3a" stroke-width="1.1" opacity=".35" fill="none">
  <line x1="627" y1="236" x2="470" y2="600"/><line x1="627" y1="236" x2="790" y2="640"/><line x1="470" y1="600" x2="790" y2="640"/>
  <line x1="378" y1="520" x2="627" y2="876"/><line x1="870" y1="520" x2="627" y2="876"/></g>
<polyline points="330,680 392,760 459,830 525,880 627,933 729,880 795,830 862,760 924,680" fill="none" stroke="#ff1c1c" stroke-width="9" opacity=".55" filter="url(#mfBlur5)"/>
<polyline points="330,686 392,766 459,836 525,886 627,939 729,886 795,836 862,766 924,686" fill="none" stroke="#ff3030" stroke-width="3"/>
<path fill-rule="evenodd" fill="#1a1a1c" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
<polygon points="329,336 627,194 627,236 354,364" fill="url(#mfRoofL)"/>
<polygon points="627,194 925,336 900,364 627,236" fill="url(#mfRoofR)"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,913 533,860 467,810 400,740 340,660" fill="#3c3c3e"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,913 721,860 787,810 854,740 914,660" fill="#343436"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,892 535,855 470,805 405,740 350,665" fill="url(#mfLitL)"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,892 719,855 784,805 849,740 904,665" fill="url(#mfLitR)"/>
<polygon points="350,665 405,740 470,805 535,855 627,892 627,913 533,860 467,810 400,740 340,660" fill="#1b1b1d"/>
<polygon points="904,665 849,740 784,805 719,855 627,892 627,913 721,860 787,810 854,740 914,660" fill="#171719"/>
<polygon points="306,380 329,380 329,520 340,600 359,650 340,660 318,600 306,520" fill="url(#mfSideL)"/>
<polygon points="948,380 925,380 926,520 914,600 895,650 914,660 936,600 948,520" fill="url(#mfSideR)"/>
<g fill="url(#mfBrush)">
  <polygon points="329,336 627,194 925,336 900,364 627,236 354,364"/>
  <polygon points="340,660 400,740 467,810 533,860 627,913 721,860 787,810 854,740 914,660 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650"/>
</g>
<polyline points="329,336 306,380 306,520 318,600 340,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="925,336 948,380 948,520 936,600 914,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="329,336 627,194 925,336" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="miter" opacity=".95"/>
<polyline points="359,650 414,725 479,790 544,840 627,876 710,840 775,790 840,725 895,650" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="miter" opacity=".9"/>

<!-- red light spilling on the inner faces -->
<polygon points="362,380 386,388 392,600 366,610" fill="url(#mfRedFace)" opacity=".75"/>
<polygon points="551,560 580,560 584,735 551,739" fill="url(#mfRedFaceR)" opacity=".0"/>
<polygon points="552,540 574,540 578,735 552,738" fill="#ff1c1c" opacity=".55" filter="url(#mfBlur5)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ff2a2a" stroke-width="3" opacity=".8" filter="url(#mfBlur2)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ffb0a8" stroke-width="1" opacity=".8"/>

<!-- red light in the M window and F gaps -->
<polygon points="432,452 546,520 540,540 436,484" fill="#ff1c1c" opacity=".85" filter="url(#mfBlur5)"/>
<polygon points="704,530 886,436 886,452 706,545" fill="#ff1c1c" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="704,640 862,566 862,580 706,652" fill="#ff1c1c" opacity=".65" filter="url(#mfBlur5)"/>

<!-- M -->
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfSteelM)"/>
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfBrush)"/>
<polygon points="597,492 617,490 617,806 597,786" fill="#000" opacity=".28"/>
<polyline points="362,367 450,398 614,486" fill="none" stroke="#fff" stroke-width="2.8" stroke-linejoin="miter"/>
<polyline points="419,444 550,519" fill="none" stroke="#ff2a2a" stroke-width="3" filter="url(#mfBlur2)"/>
<polyline points="419,444 437,712" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
<polyline points="437,712 360,616" fill="none" stroke="#ffb0a8" stroke-width="2.4" opacity=".9"/>
<polyline points="617,490 617,806" fill="none" stroke="#fff" stroke-width="2.2" opacity=".9"/>

<!-- F -->
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfSteelF)"/>
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfBrush)"/>
<polygon points="640,486 661,497 661,790 640,801" fill="#fff" opacity=".14"/>
<polyline points="640,486 890,367" fill="none" stroke="#fff" stroke-width="2.8"/>
<polyline points="699,573 881,486" fill="none" stroke="#fff" stroke-width="2.4" opacity=".95"/>
<polyline points="891,423 701,520" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="866,556 701,633" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="701,744 640,801" fill="none" stroke="#ffb0a8" stroke-width="2.2"/>
<polyline points="890,367 891,423" fill="none" stroke="#fff" stroke-width="2.2"/>

<!-- padlock -->
<g class="mf-shackle">
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="url(#mfLock)" stroke-width="13"/>
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="#fff" stroke-width="2" opacity=".55" transform="translate(-4,-4)"/>
  <path d="M591 304 L591 288 A35 35 0 0 1 661 288 L661 304" fill="none" stroke="#ff2a2a" stroke-width="4" opacity=".95" filter="url(#mfBlur2)"/>
</g>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff2a2a" stroke-width="9" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfLock)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfBrush)"/>
<polygon points="577,307 675,307 675,371 626,414 577,371" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff3a3a" stroke-width="2.6"/>
<g class="mf-key">
  <circle cx="626" cy="332" r="19" fill="#ff1c1c" opacity=".6" filter="url(#mfBlur5)"/>
  <circle cx="626" cy="332" r="13" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.6"/>
  <path d="M619 340 L633 340 L636 386 L626 392 L616 386 Z" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.4" stroke-linejoin="round"/>
</g>

<!-- orbit nodes -->
<g class="mf-node mf-n1">
  <circle cx="627" cy="150" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="627" cy="150" r="33" fill="url(#mfSteelR)"/>
  <circle cx="627" cy="150" r="27" fill="url(#mfSphere)"/>
  <circle cx="618" cy="139" r="7" fill="#fff" opacity=".35"/>
  <circle cx="627" cy="150" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="627" cy="150" r="3" fill="#fff"/>
</g><g class="mf-node mf-n2">
  <circle cx="331" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="331" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="331" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="322" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="331" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="331" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n3">
  <circle cx="925" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="925" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="925" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="916" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="925" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="925" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n4">
  <circle cx="347" cy="722" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="347" cy="722" r="33" fill="url(#mfSteelR)"/>
  <circle cx="347" cy="722" r="27" fill="url(#mfSphere)"/>
  <circle cx="338" cy="711" r="7" fill="#fff" opacity=".35"/>
  <circle cx="347" cy="722" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="347" cy="722" r="3" fill="#fff"/>
</g><g class="mf-node mf-n5">
  <circle cx="917" cy="728" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="917" cy="728" r="33" fill="url(#mfSteelR)"/>
  <circle cx="917" cy="728" r="27" fill="url(#mfSphere)"/>
  <circle cx="908" cy="717" r="7" fill="#fff" opacity=".35"/>
  <circle cx="917" cy="728" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="917" cy="728" r="3" fill="#fff"/>
</g>

<!-- wordmark -->
<g fill="#ff1c1c" opacity=".5" filter="url(#mfBlur5)" transform="translate(0,8)"><path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z"/><path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z"/></g>
<g stroke="#070103" stroke-width="3.2" paint-order="stroke" stroke-linejoin="miter">
<path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z" fill="url(#mfSteelV)"/>
<path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z" fill="url(#mfSteelV)"/>
</g>
<path d="M419 1050 L349 986 Q349 962 372 962 Q395 962 395 982 L340 1028 Q331 1050 365 1050 Q395 1050 408 1030" fill="none" stroke="#070103" stroke-width="23.5" stroke-linejoin="miter" stroke-linecap="butt"/>
<path d="M419 1050 L349 986 Q349 962 372 962 Q395 962 395 982 L340 1028 Q331 1050 365 1050 Q395 1050 408 1030" fill="none" stroke="url(#mfSteelV)" stroke-width="20" stroke-linejoin="miter" stroke-linecap="butt"/>
<path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z" fill="url(#mfBrush)"/>
<path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z" fill="url(#mfBrush)"/>
<rect x="260" y="1086" width="734" height="3" fill="url(#mfLine)"/>
<rect x="420" y="1081" width="414" height="13" fill="url(#mfLine)" opacity=".5" filter="url(#mfBlur5)"/>


<!-- light sweep across the metal -->
<g clip-path="url(#mfMetalClip)"><g class="mf-sweep"><rect x="300" y="120" width="120" height="1000" fill="url(#mfSweepG)" transform="skewX(-18)"/></g></g>
</svg>`;
const MF_LOGO_SVG_STANDALONE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="132 95 990 1035" role="img" aria-label="M&amp;F Panel"><style>
.mf-spin{transform-origin:627px 505px;animation:mfSpin 14s linear infinite}
.mf-spin.rev{animation-duration:22s;animation-direction:reverse}
@keyframes mfSpin{to{transform:rotate(360deg)}}
.mf-node{animation:mfPulse 3.6s ease-in-out infinite}
.mf-n1{animation-delay:0s}.mf-n2{animation-delay:.7s}.mf-n3{animation-delay:1.4s}.mf-n4{animation-delay:2.1s}.mf-n5{animation-delay:2.8s}
@keyframes mfPulse{0%,100%{opacity:.55}50%{opacity:1}}
.mf-sweep{animation:mfSweep 7s cubic-bezier(.45,0,.2,1) 1.2s infinite;transform:translateX(-760px)}
@keyframes mfSweep{0%{transform:translateX(-760px)}38%,100%{transform:translateX(980px)}}
.mf-key{animation:mfKey 2.8s ease-in-out infinite}
@keyframes mfKey{0%,100%{opacity:.55}50%{opacity:1}}
.mf-spark{transform-box:fill-box;transform-origin:center;animation:mfTw 4s ease-in-out infinite}
.mf-spark:nth-of-type(2n){animation-delay:1.1s}.mf-spark:nth-of-type(3n){animation-delay:2.2s}
@keyframes mfTw{0%,100%{opacity:.25;transform:scale(.6)}50%{opacity:1;transform:scale(1.15)}}
.mf-shackle{animation:mfPeek 9s ease-in-out 3s infinite}
@keyframes mfPeek{0%,90%,100%{transform:translateY(0)}93%,96%{transform:translateY(-12px)}}
.mf-aura{animation:mfAura 5s ease-in-out infinite}
.mf-smoke{animation:mfSmoke 11s ease-in-out infinite alternate}
@keyframes mfSmoke{from{opacity:.6}to{opacity:1}}
@keyframes mfAura{0%,100%{opacity:.75}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.mf-spin,.mf-node,.mf-sweep,.mf-key,.mf-spark,.mf-shackle,.mf-aura,.mf-smoke{animation:none!important}.mf-sweep{opacity:0}}
</style><defs>
  <linearGradient id="mfSteel" gradientUnits="userSpaceOnUse" x1="260" y1="190" x2="1000" y2="940">
    <stop offset="0" stop-color="#fbfbfb"/><stop offset=".22" stop-color="#d4d4d4"/><stop offset=".42" stop-color="#8f8f8f"/>
    <stop offset=".6" stop-color="#d9d9d9"/><stop offset=".8" stop-color="#7d7d7d"/><stop offset="1" stop-color="#3f3f3f"/></linearGradient>
  <linearGradient id="mfSteelM" gradientUnits="userSpaceOnUse" x1="360" y1="370" x2="620" y2="810">
    <stop offset="0" stop-color="#f2f2f2"/><stop offset=".22" stop-color="#a9a9a9"/><stop offset=".5" stop-color="#4a4a4a"/><stop offset=".78" stop-color="#8d8d8d"/><stop offset="1" stop-color="#d6d6d6"/></linearGradient>
  <linearGradient id="mfSteelF" gradientUnits="userSpaceOnUse" x1="640" y1="370" x2="900" y2="800">
    <stop offset="0" stop-color="#f4f4f4"/><stop offset=".3" stop-color="#b4b4b4"/><stop offset=".6" stop-color="#555"/><stop offset=".85" stop-color="#9a9a9a"/><stop offset="1" stop-color="#d0d0d0"/></linearGradient>
  <linearGradient id="mfRoofL" gradientUnits="userSpaceOnUse" x1="478" y1="265" x2="493" y2="296"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d2d2d2"/><stop offset=".65" stop-color="#8a8a8a"/><stop offset="1" stop-color="#474747"/></linearGradient>
  <linearGradient id="mfRoofR" gradientUnits="userSpaceOnUse" x1="776" y1="265" x2="761" y2="296"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".3" stop-color="#b8b8b8"/><stop offset=".65" stop-color="#6c6c6c"/><stop offset="1" stop-color="#2e2e2e"/></linearGradient>
  <linearGradient id="mfBotL" gradientUnits="userSpaceOnUse" x1="510" y1="815" x2="491" y2="845"><stop offset="0" stop-color="#e9e9e9"/><stop offset=".16" stop-color="#a2a2a2"/><stop offset=".42" stop-color="#555"/><stop offset="1" stop-color="#171717"/></linearGradient>
  <linearGradient id="mfBotR" gradientUnits="userSpaceOnUse" x1="744" y1="815" x2="763" y2="845"><stop offset="0" stop-color="#dcdcdc"/><stop offset=".16" stop-color="#939393"/><stop offset=".42" stop-color="#4a4a4a"/><stop offset="1" stop-color="#151515"/></linearGradient>
  <linearGradient id="mfLitL" gradientUnits="userSpaceOnUse" x1="340" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".55" stop-color="#bcbcbc"/><stop offset="1" stop-color="#7c7c7c"/></linearGradient>
  <linearGradient id="mfLitR" gradientUnits="userSpaceOnUse" x1="914" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#e8e8e8"/><stop offset=".55" stop-color="#a6a6a6"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfSideL" gradientUnits="userSpaceOnUse" x1="306" y1="0" x2="330" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSideR" gradientUnits="userSpaceOnUse" x1="948" y1="0" x2="924" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSteelV" gradientUnits="userSpaceOnUse" x1="0" y1="958" x2="0" y2="1052">
    <stop offset="0" stop-color="#f6f6f6"/><stop offset=".4" stop-color="#b3b3b3"/><stop offset=".52" stop-color="#6e6e6e"/><stop offset=".8" stop-color="#3a3a3a"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfLock" gradientUnits="userSpaceOnUse" x1="568" y1="300" x2="684" y2="420">
    <stop offset="0" stop-color="#e6e6e6"/><stop offset=".45" stop-color="#8a8a8a"/><stop offset="1" stop-color="#3c3c3c"/></linearGradient>
  <linearGradient id="mfSteelR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8d8d8"/><stop offset=".5" stop-color="#6e6e6e"/><stop offset="1" stop-color="#1e1e1e"/></linearGradient>
  <radialGradient id="mfSphere" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".3" stop-color="#ee1c1c"/><stop offset=".75" stop-color="#8a0a0a"/><stop offset="1" stop-color="#3a0000"/></radialGradient>
  <radialGradient id="mfGlowNode"><stop offset=".45" stop-color="#ff2a2a" stop-opacity=".75"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfAura" cx="627" cy="545" r="430" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff1f1f" stop-opacity=".30"/><stop offset=".55" stop-color="#b30000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfInner" cx="627" cy="560" r="330" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2a0508"/><stop offset="1" stop-color="#060102"/></radialGradient>
  <linearGradient id="mfRedFace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfRedFaceR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2a2a" stop-opacity="0"/><stop offset=".5" stop-color="#ff3a3a"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfSweepG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfArcFade" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="950" y2="0"><stop offset="0" stop-color="#e8e8e8" stop-opacity=".1"/><stop offset=".5" stop-color="#f4f4f4"/><stop offset="1" stop-color="#e8e8e8" stop-opacity=".1"/></linearGradient>
  <pattern id="mfBrush" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
    <rect width="6" height="1.2" fill="#fff" opacity=".14"/><rect y="3" width="6" height="1" fill="#000" opacity=".16"/></pattern>
  <filter id="mfBlur2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="mfBlur5" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="mfBlur25" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="25"/></filter>
  <filter id="mfBlur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <clipPath id="mfMetalClip">
  <path clip-rule="evenodd" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
  <polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616"/><polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801"/><polygon points="568,298 684,298 684,376 626,425 568,376"/>
  <path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z"/><path clip-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z"/>
</clipPath>
</defs>
<rect x="132" y="95" width="990" height="1035" fill="#050304"/>
<g class="mf-smoke" filter="url(#mfBlur25)" opacity=".9">
  <ellipse cx="300" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/><ellipse cx="960" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/>
  <ellipse cx="330" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/><ellipse cx="930" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/>
</g>
<circle class="mf-aura" cx="627" cy="545" r="430" fill="url(#mfAura)"/>

<!-- constellation behind the shield -->
<g stroke="#ff3a3a" stroke-width="1.4" opacity=".55" fill="none">
<line x1="627" y1="150" x2="505" y2="268"/><line x1="627" y1="150" x2="742" y2="238"/><line x1="742" y1="238" x2="812" y2="300"/><line x1="812" y1="300" x2="925" y2="350"/><line x1="505" y1="268" x2="331" y2="350"/><line x1="870" y1="520" x2="925" y2="350"/><line x1="870" y1="520" x2="917" y2="728"/><line x1="378" y1="520" x2="331" y2="350"/><line x1="378" y1="520" x2="347" y2="722"/><line x1="470" y1="600" x2="378" y2="520"/><line x1="690" y1="640" x2="870" y2="520"/><line x1="560" y1="700" x2="470" y2="600"/><line x1="560" y1="700" x2="690" y2="640"/><line x1="505" y1="268" x2="627" y2="330"/><line x1="742" y1="238" x2="627" y2="330"/><line x1="470" y1="600" x2="550" y2="430"/><line x1="690" y1="640" x2="700" y2="450"/>
</g>
<g><path class="mf-spark" d="M505 253 L507.7 265.3 L520 268 L507.7 270.7 L505 283 L502.3 270.7 L490 268 L502.3 265.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M742 223 L744.7 235.3 L757 238 L744.7 240.7 L742 253 L739.3 240.7 L727 238 L739.3 235.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M812 285 L814.7 297.3 L827 300 L814.7 302.7 L812 315 L809.3 302.7 L797 300 L809.3 297.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M870 505 L872.7 517.3 L885 520 L872.7 522.7 L870 535 L867.3 522.7 L855 520 L867.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M378 505 L380.7 517.3 L393 520 L380.7 522.7 L378 535 L375.3 522.7 L363 520 L375.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M560 685 L562.7 697.3 L575 700 L562.7 702.7 L560 715 L557.3 702.7 L545 700 L557.3 697.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M690 625 L692.7 637.3 L705 640 L692.7 642.7 L690 655 L687.3 642.7 L675 640 L687.3 637.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M470 585 L472.7 597.3 L485 600 L472.7 602.7 L470 615 L467.3 602.7 L455 600 L467.3 597.3Z" fill="#ff5a4a"/></g>

<!-- orbit ring -->
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff2a2a" stroke-width="2" opacity=".55" filter="url(#mfBlur2)"/>
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff4a3a" stroke-width="1.3" opacity=".8"/>
<circle cx="627" cy="505" r="352" fill="none" stroke="#d9d9d9" stroke-width="2.2" opacity=".55"/>
<path d="M328.5 318.5 A352 352 0 0 1 553.8 160.7" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<path d="M700.2 160.7 A352 352 0 0 1 925.5 318.5" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<g class="mf-spin"><path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#ff6a5a" stroke-width="4.5" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#fff3f0" stroke-width="2" stroke-linecap="round"/></g>
<g class="mf-spin rev"><path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ff4a3a" stroke-width="3" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ffd0c8" stroke-width="1.4" stroke-linecap="round"/></g>

<!-- shield interior + frame -->
<polygon points="627,236 900,364 925,380 926,520 914,600 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650 340,600 329,520 329,380 354,364" fill="url(#mfInner)"/>
<g stroke="#ff3a3a" stroke-width="1.1" opacity=".35" fill="none">
  <line x1="627" y1="236" x2="470" y2="600"/><line x1="627" y1="236" x2="790" y2="640"/><line x1="470" y1="600" x2="790" y2="640"/>
  <line x1="378" y1="520" x2="627" y2="876"/><line x1="870" y1="520" x2="627" y2="876"/></g>
<polyline points="330,680 392,760 459,830 525,880 627,933 729,880 795,830 862,760 924,680" fill="none" stroke="#ff1c1c" stroke-width="9" opacity=".55" filter="url(#mfBlur5)"/>
<polyline points="330,686 392,766 459,836 525,886 627,939 729,886 795,836 862,766 924,686" fill="none" stroke="#ff3030" stroke-width="3"/>
<path fill-rule="evenodd" fill="#1a1a1c" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
<polygon points="329,336 627,194 627,236 354,364" fill="url(#mfRoofL)"/>
<polygon points="627,194 925,336 900,364 627,236" fill="url(#mfRoofR)"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,913 533,860 467,810 400,740 340,660" fill="#3c3c3e"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,913 721,860 787,810 854,740 914,660" fill="#343436"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,892 535,855 470,805 405,740 350,665" fill="url(#mfLitL)"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,892 719,855 784,805 849,740 904,665" fill="url(#mfLitR)"/>
<polygon points="350,665 405,740 470,805 535,855 627,892 627,913 533,860 467,810 400,740 340,660" fill="#1b1b1d"/>
<polygon points="904,665 849,740 784,805 719,855 627,892 627,913 721,860 787,810 854,740 914,660" fill="#171719"/>
<polygon points="306,380 329,380 329,520 340,600 359,650 340,660 318,600 306,520" fill="url(#mfSideL)"/>
<polygon points="948,380 925,380 926,520 914,600 895,650 914,660 936,600 948,520" fill="url(#mfSideR)"/>
<g fill="url(#mfBrush)">
  <polygon points="329,336 627,194 925,336 900,364 627,236 354,364"/>
  <polygon points="340,660 400,740 467,810 533,860 627,913 721,860 787,810 854,740 914,660 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650"/>
</g>
<polyline points="329,336 306,380 306,520 318,600 340,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="925,336 948,380 948,520 936,600 914,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="329,336 627,194 925,336" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="miter" opacity=".95"/>
<polyline points="359,650 414,725 479,790 544,840 627,876 710,840 775,790 840,725 895,650" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="miter" opacity=".9"/>

<!-- red light spilling on the inner faces -->
<polygon points="362,380 386,388 392,600 366,610" fill="url(#mfRedFace)" opacity=".75"/>
<polygon points="551,560 580,560 584,735 551,739" fill="url(#mfRedFaceR)" opacity=".0"/>
<polygon points="552,540 574,540 578,735 552,738" fill="#ff1c1c" opacity=".55" filter="url(#mfBlur5)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ff2a2a" stroke-width="3" opacity=".8" filter="url(#mfBlur2)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ffb0a8" stroke-width="1" opacity=".8"/>

<!-- red light in the M window and F gaps -->
<polygon points="432,452 546,520 540,540 436,484" fill="#ff1c1c" opacity=".85" filter="url(#mfBlur5)"/>
<polygon points="704,530 886,436 886,452 706,545" fill="#ff1c1c" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="704,640 862,566 862,580 706,652" fill="#ff1c1c" opacity=".65" filter="url(#mfBlur5)"/>

<!-- M -->
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfSteelM)"/>
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfBrush)"/>
<polygon points="597,492 617,490 617,806 597,786" fill="#000" opacity=".28"/>
<polyline points="362,367 450,398 614,486" fill="none" stroke="#fff" stroke-width="2.8" stroke-linejoin="miter"/>
<polyline points="419,444 550,519" fill="none" stroke="#ff2a2a" stroke-width="3" filter="url(#mfBlur2)"/>
<polyline points="419,444 437,712" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
<polyline points="437,712 360,616" fill="none" stroke="#ffb0a8" stroke-width="2.4" opacity=".9"/>
<polyline points="617,490 617,806" fill="none" stroke="#fff" stroke-width="2.2" opacity=".9"/>

<!-- F -->
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfSteelF)"/>
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfBrush)"/>
<polygon points="640,486 661,497 661,790 640,801" fill="#fff" opacity=".14"/>
<polyline points="640,486 890,367" fill="none" stroke="#fff" stroke-width="2.8"/>
<polyline points="699,573 881,486" fill="none" stroke="#fff" stroke-width="2.4" opacity=".95"/>
<polyline points="891,423 701,520" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="866,556 701,633" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="701,744 640,801" fill="none" stroke="#ffb0a8" stroke-width="2.2"/>
<polyline points="890,367 891,423" fill="none" stroke="#fff" stroke-width="2.2"/>

<!-- padlock -->
<g class="mf-shackle">
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="url(#mfLock)" stroke-width="13"/>
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="#fff" stroke-width="2" opacity=".55" transform="translate(-4,-4)"/>
  <path d="M591 304 L591 288 A35 35 0 0 1 661 288 L661 304" fill="none" stroke="#ff2a2a" stroke-width="4" opacity=".95" filter="url(#mfBlur2)"/>
</g>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff2a2a" stroke-width="9" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfLock)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfBrush)"/>
<polygon points="577,307 675,307 675,371 626,414 577,371" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff3a3a" stroke-width="2.6"/>
<g class="mf-key">
  <circle cx="626" cy="332" r="19" fill="#ff1c1c" opacity=".6" filter="url(#mfBlur5)"/>
  <circle cx="626" cy="332" r="13" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.6"/>
  <path d="M619 340 L633 340 L636 386 L626 392 L616 386 Z" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.4" stroke-linejoin="round"/>
</g>

<!-- orbit nodes -->
<g class="mf-node mf-n1">
  <circle cx="627" cy="150" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="627" cy="150" r="33" fill="url(#mfSteelR)"/>
  <circle cx="627" cy="150" r="27" fill="url(#mfSphere)"/>
  <circle cx="618" cy="139" r="7" fill="#fff" opacity=".35"/>
  <circle cx="627" cy="150" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="627" cy="150" r="3" fill="#fff"/>
</g><g class="mf-node mf-n2">
  <circle cx="331" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="331" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="331" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="322" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="331" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="331" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n3">
  <circle cx="925" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="925" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="925" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="916" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="925" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="925" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n4">
  <circle cx="347" cy="722" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="347" cy="722" r="33" fill="url(#mfSteelR)"/>
  <circle cx="347" cy="722" r="27" fill="url(#mfSphere)"/>
  <circle cx="338" cy="711" r="7" fill="#fff" opacity=".35"/>
  <circle cx="347" cy="722" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="347" cy="722" r="3" fill="#fff"/>
</g><g class="mf-node mf-n5">
  <circle cx="917" cy="728" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="917" cy="728" r="33" fill="url(#mfSteelR)"/>
  <circle cx="917" cy="728" r="27" fill="url(#mfSphere)"/>
  <circle cx="908" cy="717" r="7" fill="#fff" opacity=".35"/>
  <circle cx="917" cy="728" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="917" cy="728" r="3" fill="#fff"/>
</g>

<!-- wordmark -->
<g fill="#ff1c1c" opacity=".5" filter="url(#mfBlur5)" transform="translate(0,8)"><path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z"/><path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z"/></g>
<g stroke="#070103" stroke-width="3.2" paint-order="stroke" stroke-linejoin="miter">
<path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z" fill="url(#mfSteelV)"/>
<path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z" fill="url(#mfSteelV)"/>
</g>
<path d="M419 1050 L349 986 Q349 962 372 962 Q395 962 395 982 L340 1028 Q331 1050 365 1050 Q395 1050 408 1030" fill="none" stroke="#070103" stroke-width="23.5" stroke-linejoin="miter" stroke-linecap="butt"/>
<path d="M419 1050 L349 986 Q349 962 372 962 Q395 962 395 982 L340 1028 Q331 1050 365 1050 Q395 1050 408 1030" fill="none" stroke="url(#mfSteelV)" stroke-width="20" stroke-linejoin="miter" stroke-linecap="butt"/>
<path d="M160 971 L171 960 L191 960 L191 1052 L160 1052Z M316 971 L305 960 L285 960 L285 1052 L316 1052Z M191 960 L238 1042 L238 1052 L222 1052 L191 998Z M285 960 L238 1042 L238 1052 L254 1052 L285 998Z M438 960 L469 960 L469 1052 L438 1052Z M438 960 L546 960 L526 986 L438 986Z M469 1003 L526 1003 L510 1028 L469 1028Z M587 960 L618 960 L618 1052 L587 1052Z M618 960 L681 960 L695 974 L695 1016 L681 1030 L618 1030 L618 1007 L664 1007 L667 1004 L667 986 L664 983 L618 983Z M813 960 L843 960 L843 1052 L813 1052Z M884 960 L914 960 L914 1052 L884 1052Z M843 960 L871 960 L914 1052 L886 1052Z M925 960 L956 960 L956 1052 L925 1052Z M925 960 L1011 960 L995 986 L925 986Z M956 1004 L997 1004 L983 1028 L956 1028Z M925 1026 L1011 1026 L1011 1052 L925 1052Z M1015 960 L1046 960 L1046 1052 L1015 1052Z M1015 1039 L1096 1039 L1106 1052 L1015 1052Z" fill="url(#mfBrush)"/>
<path fill-rule="evenodd" d="M701 1052 L739 960 L765 960 L802 1052 L771 1052 L763 1030 L740 1030 L732 1052Z M751 986 L762 1012 L740 1012Z" fill="url(#mfBrush)"/>
<rect x="260" y="1086" width="734" height="3" fill="url(#mfLine)"/>
<rect x="420" y="1081" width="414" height="13" fill="url(#mfLine)" opacity=".5" filter="url(#mfBlur5)"/>


<!-- light sweep across the metal -->
<g clip-path="url(#mfMetalClip)"><g class="mf-sweep"><rect x="300" y="120" width="120" height="1000" fill="url(#mfSweepG)" transform="skewX(-18)"/></g></g>
</svg>`;
const MF_LOGO_CSS = `.mf-spin{transform-origin:627px 505px;animation:mfSpin 14s linear infinite}
.mf-spin.rev{animation-duration:22s;animation-direction:reverse}
@keyframes mfSpin{to{transform:rotate(360deg)}}
.mf-node{animation:mfPulse 3.6s ease-in-out infinite}
.mf-n1{animation-delay:0s}.mf-n2{animation-delay:.7s}.mf-n3{animation-delay:1.4s}.mf-n4{animation-delay:2.1s}.mf-n5{animation-delay:2.8s}
@keyframes mfPulse{0%,100%{opacity:.55}50%{opacity:1}}
.mf-sweep{animation:mfSweep 7s cubic-bezier(.45,0,.2,1) 1.2s infinite;transform:translateX(-760px)}
@keyframes mfSweep{0%{transform:translateX(-760px)}38%,100%{transform:translateX(980px)}}
.mf-key{animation:mfKey 2.8s ease-in-out infinite}
@keyframes mfKey{0%,100%{opacity:.55}50%{opacity:1}}
.mf-spark{transform-box:fill-box;transform-origin:center;animation:mfTw 4s ease-in-out infinite}
.mf-spark:nth-of-type(2n){animation-delay:1.1s}.mf-spark:nth-of-type(3n){animation-delay:2.2s}
@keyframes mfTw{0%,100%{opacity:.25;transform:scale(.6)}50%{opacity:1;transform:scale(1.15)}}
.mf-shackle{animation:mfPeek 9s ease-in-out 3s infinite}
@keyframes mfPeek{0%,90%,100%{transform:translateY(0)}93%,96%{transform:translateY(-12px)}}
.mf-aura{animation:mfAura 5s ease-in-out infinite}
.mf-smoke{animation:mfSmoke 11s ease-in-out infinite alternate}
@keyframes mfSmoke{from{opacity:.6}to{opacity:1}}
@keyframes mfAura{0%,100%{opacity:.75}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.mf-spin,.mf-node,.mf-sweep,.mf-key,.mf-spark,.mf-shackle,.mf-aura,.mf-smoke{animation:none!important}.mf-sweep{opacity:0}}`;

function renderAuthPage(activeTab, errorMsg) {
  const closed = REGISTRATION === "closed";
  const isRegister = activeTab === "register" && !closed;
  const seg = closed ? "" : `
        <div class="seg ${isRegister ? "reg" : ""}" id="seg" role="tablist">
          <i></i>
          <button type="button" role="tab" data-mode="login" class="${isRegister ? "" : "on"}">ورود</button>
          <button type="button" role="tab" data-mode="register" class="${isRegister ? "on" : ""}">ثبت\u200cنام</button>
        </div>`;
  const registerForm = closed ? "" : `
        <form id="registerForm" class="form ${isRegister ? "on" : ""}" novalidate autocomplete="off">
          <label class="in">
            <svg class="i"><use href="#i-user"/></svg>
            <input name="username" type="text" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="نام کاربری" aria-label="نام کاربری">
          </label>
          <label class="in">
            <svg class="i"><use href="#i-lock"/></svg>
            <input name="password" id="regPass" type="password" dir="ltr" autocomplete="new-password" placeholder="رمز عبور (حداقل ۸ نویسه)" aria-label="رمز عبور">
            <button type="button" class="eye" data-eye="regPass" aria-label="نمایش رمز"><svg class="i vis"><use href="#i-eye"/></svg><svg class="i off"><use href="#i-eyeoff"/></svg></button>
          </label>
          <button class="go" type="submit"><span class="lbl">ساخت حساب</span><svg class="i ar"><use href="#i-arrow"/></svg><span class="sp"></span></button>
        </form>`;
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#050304">
<title>ورود | ${BRAND}</title>
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<style>
:root{
  --bg:#050304; --ink:#f6efef; --muted:#a1969a; --red:#ff2a2a; --red2:#c1121f; --ember:#ff6a55;
  --card:rgba(17,11,13,.82); --line:rgba(255,90,90,.20); --field:rgba(255,255,255,.05); --err:#ff8080;
  --out:cubic-bezier(.22,1,.36,1); --soft:cubic-bezier(.45,0,.55,1);
  box-sizing:border-box; padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
}
@property --a{syntax:"<angle>";initial-value:0deg;inherits:false}
html{background:var(--bg);scroll-padding-top:env(safe-area-inset-top,0px)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Tahoma,"Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
svg.i{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}

.wrap{direction:ltr;position:relative;min-height:100svh;overflow:hidden;display:flex;
  background:radial-gradient(55% 45% at 88% 102%,rgba(255,42,42,.13),transparent 70%),var(--bg)}

/* ---------- art panel ---------- */
.art{position:absolute;inset:0;contain:layout paint;clip-path:polygon(0 0,59% 0,45% 100%,0 100%);
  background:radial-gradient(70% 62% at 36% 44%,#2b0508 0%,#12030a 46%,#050304 82%)}
.smoke{position:absolute;border-radius:50%;filter:blur(58px);will-change:transform;opacity:.5}
.s1{width:46vmax;height:46vmax;left:-14vmax;bottom:-20vmax;background:radial-gradient(circle,#b3121a 0%,rgba(120,0,10,.4) 45%,transparent 70%);animation:dr1 38s var(--soft) infinite}
.s2{width:34vmax;height:34vmax;left:18vmax;top:-14vmax;opacity:.42;background:radial-gradient(circle,#7a0a12,transparent 68%);animation:dr2 44s var(--soft) infinite}
.s3{width:26vmax;height:26vmax;left:-6vmax;top:24vmax;opacity:.3;background:radial-gradient(circle,rgba(160,160,170,.4),transparent 66%);animation:dr3 52s var(--soft) infinite}
@keyframes dr1{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(5vmax,-4vmax,0) scale(1.12)}}
@keyframes dr2{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-4vmax,5vmax,0) scale(1.1)}}
@keyframes dr3{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(6vmax,-3vmax,0)}}
#net{position:absolute;inset:0;width:100%;height:100%}
.embers{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.em{position:absolute;bottom:-12px;width:var(--s);height:var(--s);border-radius:50%;opacity:0;will-change:transform,opacity;
  background:radial-gradient(circle,#fff2ee 0%,#ff6a55 40%,transparent 72%);animation:rise var(--d) linear var(--l) infinite}
@keyframes rise{0%{transform:translate3d(0,0,0) scale(.7);opacity:0}12%{opacity:.9}100%{transform:translate3d(var(--x),-105vh,0) scale(.2);opacity:0}}

.hero{position:absolute;inset:0;width:52%;display:grid;align-content:center;justify-items:center;direction:rtl;text-align:center;perspective:1200px}
.stage{position:relative;height:min(66vh,640px);aspect-ratio:990/1035;max-width:100%;
  transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .3s var(--out)}
.fl{position:relative;width:100%;height:100%;animation:float 8s var(--soft) 1.6s infinite}
@keyframes float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-9px,0)}}
.stage svg.logo{position:relative;display:block;width:100%;height:100%;overflow:visible;animation:logoIn 1.6s var(--out) .1s both}
@keyframes logoIn{from{opacity:0;transform:scale(.86)}}
.halo{position:absolute;left:50%;top:39.6%;width:78%;aspect-ratio:1;margin:-39% 0 0 -39%;border-radius:50%;pointer-events:none;opacity:.85;will-change:transform;
  background:conic-gradient(from 0deg,transparent 0 42%,rgba(255,70,55,.62) 82%,transparent 100%);
  -webkit-mask:radial-gradient(circle farthest-side,transparent 78%,#000 88%,#000 94%,transparent 100%);mask:radial-gradient(circle farthest-side,transparent 78%,#000 88%,#000 94%,transparent 100%);
  animation:spin 13s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.pill{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;margin-top:6px;border-radius:99px;font-size:13px;color:#ffc9c2;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,120,110,.22);animation:fadeUp 1s var(--out) 1s both}
.pill i{width:8px;height:8px;border-radius:50%;background:#ff4a3a;box-shadow:0 0 10px #ff4a3a;animation:pulse 2.4s var(--soft) infinite}
@keyframes pulse{50%{opacity:.3}}
.tag{margin:10px 0 0;font-size:14px;line-height:1.9;color:#b79a9c;animation:fadeUp 1s var(--out) 1.15s both}
@keyframes fadeUp{from{opacity:0;transform:translate3d(0,12px,0)}}

.edge{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.edge line{vector-effect:non-scaling-stroke;fill:none}
.edge .e1{stroke:rgba(255,60,50,.55);stroke-width:1.4;filter:drop-shadow(0 0 6px rgba(255,42,42,.9))}
.edge .e2{stroke:#fff1ee;stroke-width:2;stroke-dasharray:70 4000;stroke-linecap:round;animation:flow 6s linear infinite;filter:drop-shadow(0 0 8px #ff3a2a)}
@keyframes flow{from{stroke-dashoffset:70}to{stroke-dashoffset:-2200}}

/* ---------- form side ---------- */
.formcol{position:relative;z-index:2;margin-left:auto;width:46%;min-height:100svh;display:grid;place-items:center;padding:32px 4vw;direction:rtl}
.card{position:relative;width:100%;max-width:380px;padding:24px 24px 20px;background:var(--card);border:1px solid var(--line);border-radius:22px;
  box-shadow:0 30px 80px -30px rgba(255,30,30,.4);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);animation:cardIn 1.1s var(--out) .15s both}
.card::before{content:"";position:absolute;inset:-1px;border-radius:23px;padding:1.5px;pointer-events:none;
  background:conic-gradient(from var(--a),transparent 0 72%,rgba(255,110,95,.95) 86%,transparent 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:bspin 7s linear infinite}
@keyframes bspin{to{--a:360deg}}
@keyframes cardIn{from{opacity:0;transform:translate3d(0,34px,0) scale(.96)}}
.card.shake{animation:shake .45s var(--out)}
@keyframes shake{20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
.card>.body{transition:opacity .45s var(--soft)}
.card.done>.body{opacity:0;pointer-events:none}
.card h1{margin:0 0 18px;font-size:21px;font-weight:800}

.seg{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin-bottom:16px;background:var(--field);border:1px solid var(--line);border-radius:14px}
.seg button{position:relative;z-index:1;height:38px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:14px;font-weight:700;cursor:pointer;border-radius:10px;transition:color .3s var(--soft)}
.seg button.on{color:#fff}
.seg i{position:absolute;top:4px;bottom:4px;right:4px;width:calc(50% - 6px);border-radius:10px;background:linear-gradient(135deg,var(--red2),var(--red));
  box-shadow:0 8px 22px -8px rgba(255,42,42,.75);transition:transform .45s var(--out)}
.seg.reg i{transform:translateX(calc(-100% - 4px))}

.form{display:none}.form.on{display:block;animation:fin .5s var(--out)}
@keyframes fin{from{opacity:0;transform:translate3d(0,10px,0)}}
.in{display:flex;align-items:center;gap:10px;height:48px;padding:0 14px;margin-bottom:10px;background:var(--field);border:1px solid var(--line);border-radius:14px;color:var(--muted);
  transition:background .3s var(--soft),border-color .3s var(--soft),box-shadow .3s var(--soft),color .3s var(--soft)}
.in:focus-within{background:rgba(255,255,255,.08);border-color:var(--red);color:var(--red);box-shadow:0 0 0 4px rgba(255,42,42,.16)}
.in.bad{border-color:var(--err);color:var(--err);box-shadow:0 0 0 4px rgba(255,100,100,.12)}
.in input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.in input::placeholder{color:#7d7276}
.in input:-webkit-autofill{-webkit-text-fill-color:#fff;transition:background-color 99999s}
.eye{border:0;background:none;color:inherit;cursor:pointer;display:grid;place-items:center;padding:6px;border-radius:10px}
.eye .off{display:none}.eye.on .off{display:block}.eye.on .vis{display:none}
.eye:focus-visible,.seg button:focus-visible,.go:focus-visible{outline:3px solid rgba(255,90,80,.55);outline-offset:2px}

.go{position:relative;overflow:hidden;width:100%;height:48px;margin-top:6px;border:0;border-radius:99px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
  color:#fff;font:inherit;font-weight:700;font-size:15px;background:linear-gradient(90deg,var(--red2),var(--red));box-shadow:0 14px 32px -12px rgba(255,42,42,.75);transition:box-shadow .4s var(--out)}
.go::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.38),transparent);transform:skewX(-20deg);animation:shine 5.5s var(--soft) 1.5s infinite}
@keyframes shine{0%{transform:translate3d(0,0,0) skewX(-20deg)}35%,100%{transform:translate3d(420%,0,0) skewX(-20deg)}}
.go:hover{box-shadow:0 20px 40px -12px rgba(255,42,42,.9)}
.go:active{filter:brightness(.94)}
.go .sp{display:none;width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .8s linear infinite}
.go.load .ar,.go.load .lbl{display:none}.go.load .sp{display:block}
.go:disabled{cursor:wait}
.msg{min-height:18px;margin:10px 0 0;font-size:12.5px;text-align:center;color:var(--err);line-height:1.7}
.msg.ok{color:#ffb3a8}

.tg{text-decoration:none;unicode-bidi:isolate;display:inline-flex;align-items:center;gap:8px;padding:6px 13px 6px 11px;border-radius:99px;font-size:12.5px;color:var(--muted);background:rgba(255,255,255,.05);border:1px solid var(--line);transition:color .25s var(--soft),border-color .25s var(--soft),box-shadow .35s var(--out),transform .2s var(--out)}
.tg svg{width:20px;height:20px;flex:none}
.tg:hover{color:#fff;border-color:rgba(255,110,100,.55);box-shadow:0 0 24px -6px rgba(255,42,42,.75)}
.tg:active{transform:scale(.96)}
.tg:focus-visible{outline:3px solid rgba(255,90,80,.55);outline-offset:2px}
.tg-wrap{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));display:flex;justify-content:center;z-index:3;animation:fadeUp 1s var(--out) 1.3s both}

/* ---------- success: the shield unlocks ---------- */
.portal{position:fixed;z-index:50;border-radius:50%;pointer-events:none;background:#2a0306;
  box-shadow:0 0 0 3px rgba(255,120,110,.85),0 0 80px 14px rgba(255,42,42,.65);transform:scale(0);will-change:transform;transition:transform 1s cubic-bezier(.7,0,.2,1)}
.portal.on{transform:scale(1)}
.win{position:fixed;inset:0;z-index:51;display:grid;place-items:center;opacity:0;pointer-events:none;overflow:hidden;
  background:radial-gradient(60% 55% at 50% 42%,#5a0710 0%,#2a0408 40%,#090204 76%,#050304 100%);transition:opacity .5s var(--soft)}
.win.on{opacity:1;pointer-events:auto;transition-delay:.55s}
.stage2{position:relative;display:grid;justify-items:center;text-align:center;padding:0 20px}
.chk{position:relative;width:200px;height:220px;display:grid;place-items:center}
.mini{position:relative;width:200px;height:220px;overflow:visible}
.shf,.lk{opacity:0}.win.on .shf{animation:show .6s var(--soft) 1.5s forwards}.win.on .lk{animation:show .5s var(--soft) 1.25s forwards}
.shl{stroke-dasharray:1;stroke-dashoffset:1}.win.on .shl{animation:draw 1s var(--soft) .85s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.shk{transform-origin:122px 98px}.win.on .shk{animation:unlock .7s cubic-bezier(.34,1.56,.64,1) 1.8s forwards}
@keyframes unlock{to{transform:translateY(-15px) rotate(-30deg)}}
.key{fill:#12040a}.win.on .key{animation:keyOn .4s ease 1.9s forwards}
@keyframes keyOn{to{fill:#ff3a3a}}
.rp{position:absolute;inset:10px;border-radius:50%;border:2px solid rgba(255,110,100,.7);opacity:0;will-change:transform,opacity}
.win.on .rp:nth-child(1){animation:ripple 2.4s var(--soft) 1.9s infinite}
.win.on .rp:nth-child(2){animation:ripple 2.4s var(--soft) 2.7s infinite}
.win.on .rp:nth-child(3){animation:ripple 2.4s var(--soft) 3.5s infinite}
@keyframes ripple{from{transform:scale(.7);opacity:.9}to{transform:scale(2.8);opacity:0}}
.flash{position:absolute;left:50%;top:50%;width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;opacity:0;transform:scale(0);
  background:radial-gradient(circle,rgba(255,215,205,.95),rgba(255,42,42,.5) 42%,transparent 70%)}
.win.on .flash{animation:flash .9s ease-out 1.85s forwards}
@keyframes flash{0%{transform:scale(.2);opacity:1}100%{transform:scale(3.4);opacity:0}}
.pt{position:absolute;left:50%;top:50%;margin:-3px 0 0 -3px;border-radius:50%;background:#ffd9d2;box-shadow:0 0 10px #ff4a3a;opacity:0;will-change:transform,opacity}
.win.on .pt{animation:fly 1.3s cubic-bezier(.12,.8,.2,1) forwards}
@keyframes fly{0%{transform:translate3d(0,0,0) scale(1);opacity:1}100%{transform:translate3d(var(--tx),var(--ty),0) scale(0);opacity:0}}
.win h2{margin:30px 0 8px;font-size:clamp(28px,5.5vw,42px);font-weight:800;opacity:0;text-shadow:0 0 28px rgba(255,42,42,.75)}
.win.on h2{animation:wipe .9s var(--out) 2s forwards}
@keyframes wipe{from{opacity:1;clip-path:inset(0 0 0 100%)}to{opacity:1;clip-path:inset(0 0 0 0)}}
.sub2{margin:0;color:#ffc9c2;font-size:15px;opacity:0}.win.on .sub2{animation:show .6s var(--soft) 2.4s forwards}
.bar{width:min(240px,62vw);height:4px;margin-top:22px;border-radius:9px;background:rgba(255,255,255,.14);overflow:hidden;opacity:0}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#fff,#ff8a7a);transform:scaleX(0);transform-origin:right}
.win.on .bar{animation:show .4s var(--soft) 2.3s forwards}.win.on .bar i{animation:fill .85s var(--soft) 2.35s forwards}
@keyframes fill{to{transform:scaleX(1)}}
@keyframes show{to{opacity:1;visibility:visible}}

/* ---------- small screens: art on top, card as a bottom sheet ---------- */
@media (max-width:860px),(max-aspect-ratio:4/5){
  :root{padding-top:0;padding-bottom:0}
  .art{clip-path:none}
  .edge{display:none}
  .hero{width:100%;padding:calc(3svh + env(safe-area-inset-top,0px)) 16px 0;align-content:start}
  .stage{height:clamp(150px,40svh,360px)}
  .pill,.tag{display:none}
  .formcol{width:100%;min-height:0;margin:0;padding:0;display:flex;justify-content:center;align-self:flex-end}
  .card{max-width:520px;border-radius:28px 28px 0 0;border-bottom:0;padding:20px 20px calc(58px + env(safe-area-inset-bottom,0px));box-shadow:0 -18px 50px -20px rgba(255,30,30,.45)}
  .card::before{border-radius:29px 29px 0 0}
  .in input{font-size:16px}
  .s1{width:80vw;height:80vw;left:-24vw;top:30svh;bottom:auto}
  .s2{width:50vw;height:50vw;left:46vw;top:-10vw}
  .s3{display:none}
  .tg-wrap{bottom:calc(14px + env(safe-area-inset-bottom,0px))}
}
@media (max-width:860px) and (max-height:640px){.stage{height:clamp(110px,26svh,200px)}.card h1{display:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}
  .win .shl{stroke-dashoffset:0}.win .shf,.win .lk,.win h2,.win .sub2,.win .bar{opacity:1;visibility:visible}.win .bar i{transform:none}.win .shk{transform:translateY(-15px) rotate(-30deg)}}
${MF_LOGO_CSS}
.mf-smoke{animation:none}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="3"/><path d="M8 11V8a4 4 0 018 0v3"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-eyeoff" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M20 12H4M10 6l-6 6 6 6"/></symbol>
</defs></svg>

<div class="wrap" id="wrap">
  <section class="art" aria-label="${BRAND}">
    <div class="smoke s1"></div><div class="smoke s2"></div><div class="smoke s3"></div>
    <canvas id="net" aria-hidden="true"></canvas>
    <div class="embers" id="embers" aria-hidden="true"></div>
    <div class="hero">
      <div class="stage" id="stage"><div class="halo" aria-hidden="true"></div><div class="fl">${MF_LOGO_SVG}</div></div>
      <span class="pill"><i></i>پنل اشتراک</span>
      <p class="tag">به پنل اشتراک خوش آمدی.</p>
    </div>
  </section>
  <svg class="edge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line class="e1" x1="59" y1="0" x2="45" y2="100"/><line class="e2" x1="59" y1="0" x2="45" y2="100"/></svg>

  <main class="formcol">
    <div class="card" id="card">
      <div class="body">${seg}
        <h1 id="title">${isRegister ? "ساخت حساب جدید" : "ورود به حساب"}</h1>
        <form id="loginForm" class="form ${isRegister ? "" : "on"}" novalidate>
          <label class="in">
            <svg class="i"><use href="#i-user"/></svg>
            <input name="username" type="text" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="نام کاربری" aria-label="نام کاربری">
          </label>
          <label class="in">
            <svg class="i"><use href="#i-lock"/></svg>
            <input name="password" id="loginPass" type="password" dir="ltr" autocomplete="current-password" placeholder="رمز عبور" aria-label="رمز عبور">
            <button type="button" class="eye" data-eye="loginPass" aria-label="نمایش رمز"><svg class="i vis"><use href="#i-eye"/></svg><svg class="i off"><use href="#i-eyeoff"/></svg></button>
          </label>
          <button class="go" type="submit"><span class="lbl">ورود</span><svg class="i ar"><use href="#i-arrow"/></svg><span class="sp"></span></button>
        </form>${registerForm}
        <div class="msg" id="alertBox" role="alert">${errorMsg ? htmlEscape(errorMsg) : ""}</div>
      </div>
    </div>
    <div class="tg-wrap"><a class="tg" href="https://t.me/M_Fpanel" target="_blank" rel="noopener noreferrer" title="ارتباط با ما در تلگرام" aria-label="تلگرام M_Fpanel"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#37aee2"/><stop offset="1" stop-color="#1e96c8"/></linearGradient></defs><circle cx="12" cy="12" r="12" fill="url(#tgG)"/><path fill="#fff" d="M5.4 11.6l11.2-4.3c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.4-.1L8.9 13.5l-2.9-.9c-.6-.2-.6-.6.1-.9z"/></svg><span dir="ltr">@M_Fpanel</span></a></div>
  </main>
</div>

<div class="portal" id="portal"></div>
<div class="win" id="win" aria-live="polite">
  <div class="stage2">
    <div class="chk" id="chk">
      <i class="rp"></i><i class="rp"></i><i class="rp"></i><i class="flash"></i>
      <svg class="mini" viewBox="0 0 200 220" aria-hidden="true">
        <defs><linearGradient id="mnS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".5" stop-color="#8a8a8a"/><stop offset="1" stop-color="#3a3a3a"/></linearGradient></defs>
        <path class="shf" d="M100 12 L182 56 L186 128 Q184 176 100 210 Q16 176 14 128 L18 56 Z" fill="#14050a"/>
        <path class="shl" d="M100 12 L182 56 L186 128 Q184 176 100 210 Q16 176 14 128 L18 56 Z" fill="none" stroke="url(#mnS)" stroke-width="7" stroke-linejoin="round" pathLength="1"/>
        <g class="lk">
          <g class="shk"><path d="M78 98 V82 a22 22 0 0 1 44 0 V98" fill="none" stroke="#e8e8e8" stroke-width="9" stroke-linecap="round"/></g>
          <rect x="64" y="96" width="72" height="56" rx="10" fill="url(#mnS)"/>
          <circle class="key" cx="100" cy="120" r="8" stroke="#ff3a3a" stroke-width="3"/>
          <path d="M100 126 V141" stroke="#ff3a3a" stroke-width="5" stroke-linecap="round"/>
        </g>
      </svg>
    </div>
    <h2 id="winTitle">خوش آمدی</h2>
    <p class="sub2" id="winSub">در حال انتقال به حسابت…</p>
    <div class="bar"><i></i></div>
  </div>
</div>

<script>
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var card = $("#card"), box = $("#alertBox"), title = $("#title");

  /* ---- mode switch (login / register) ---- */
  var TITLES = { login: "ورود به حساب", register: "ساخت حساب جدید" };
  function setMode(m) {
    var lf = $("#loginForm"), rf = $("#registerForm");
    if (!rf) m = "login";
    lf.classList.toggle("on", m === "login");
    if (rf) rf.classList.toggle("on", m === "register");
    var seg = $("#seg");
    if (seg) {
      seg.classList.toggle("reg", m === "register");
      $$("button", seg).forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mode") === m); });
    }
    title.textContent = TITLES[m];
    say("");
    $$(".in.bad").forEach(function (n) { n.classList.remove("bad"); });
    try { history.replaceState(null, "", m === "register" ? "/register" : "/login"); } catch (e) {}
  }
  $$("[data-mode]").forEach(function (b) { b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); }); });

  function say(text, ok) { box.textContent = text || ""; box.className = "msg" + (ok ? " ok" : ""); }

  $$(".eye").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.getElementById(b.getAttribute("data-eye"));
      var show = el.type === "password";
      el.type = show ? "text" : "password";
      b.classList.toggle("on", show);
    });
  });
  $$(".in input").forEach(function (i) { i.addEventListener("input", function () { i.parentNode.classList.remove("bad"); }); });

  /* ---- submit ---- */
  function fail(text, fields) {
    say(text);
    (fields || []).forEach(function (f) { if (f && f.parentNode) f.parentNode.classList.add("bad"); });
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }

  function wire(formId, url, isReg) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $(".go", form), u = form.elements.username, p = form.elements.password;
      var bu = !u.value.trim(), bp = isReg ? p.value.length < 8 : !p.value;
      if (bu || bp) {
        var msg = bu ? "نام کاربری را وارد کن." : (isReg ? "رمز عبور باید حداقل ۸ نویسه باشد." : "رمز عبور را وارد کن.");
        return fail(msg, [bu ? u : null, bp ? p : null]);
      }
      say(""); btn.disabled = true; btn.classList.add("load");
      var payload = {};
      Array.prototype.forEach.call(form.elements, function (el) { if (el.name) payload[el.name] = el.value; });
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.ok) {
            btn.disabled = false; btn.classList.remove("load");
            return fail((data && data.msg) || "خطایی رخ داد.", []);
          }
          celebrate(data, isReg, btn);
        })
        .catch(function (err) {
          btn.disabled = false; btn.classList.remove("load");
          fail("ارتباط با سرور برقرار نشد.", []);
        });
    });
  }
  wire("loginForm", "/api/auth/login", false);
  wire("registerForm", "/api/auth/register", true);

  /* ---- success: the shield unlocks, then we go to the dashboard ---- */
  var go = function (u) { (window.__mfGo || function (x) { location.href = x; })(u); };
  var portal = $("#portal"), win = $("#win"), chk = $("#chk");
  for (var k = 0; k < 28; k++) {
    var pt = document.createElement("i"), a = Math.random() * 6.283, d = 110 + Math.random() * 190, z = 4 + Math.random() * 6;
    pt.className = "pt";
    pt.style.cssText = "--tx:" + (Math.cos(a) * d).toFixed(1) + "px;--ty:" + (Math.sin(a) * d).toFixed(1) + "px;width:" + z.toFixed(1) + "px;height:" + z.toFixed(1) + "px;animation-delay:" + (1.85 + Math.random() * .2).toFixed(2) + "s";
    chk.appendChild(pt);
  }
  function celebrate(data, isReg, btn) {
    var target = data.redirect || "/sub";
    $("#winTitle").textContent = isReg ? "حساب ساخته شد" : "خوش آمدی";
    if (reduce) { win.classList.add("on"); portal.classList.add("on"); setTimeout(function () { go(target); }, 350); return; }
    var r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 24;
    portal.style.left = (cx - R) + "px"; portal.style.top = (cy - R) + "px"; portal.style.width = (2 * R) + "px"; portal.style.height = (2 * R) + "px";
    document.body.style.overflow = "hidden";
    card.classList.add("done");
    portal.classList.add("on"); win.classList.add("on");
    setTimeout(function () { go(target); }, 3300);
  }

  /* ---- constellation (the logo's network, alive) ---- */
  var cv = $("#net");
  if (cv && cv.getContext) {
    var cx2 = cv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0, N = [], raf = 0;
    var size = function () {
      var b = cv.getBoundingClientRect(); W = b.width; H = b.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(46, Math.max(16, W * H / 28000))); N = [];
      for (var i = 0; i < n; i++) N.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .24, vy: (Math.random() - .5) * .24, r: Math.random() * 1.4 + .7, p: Math.random() * 6.28 });
      frame(0);
    };
    var frame = function (t) {
      cx2.clearRect(0, 0, W, H);
      var L = Math.min(160, Math.max(95, W * .12)), i, j;
      for (i = 0; i < N.length; i++) {
        var n = N[i];
        if (!reduce) { n.x += n.vx; n.y += n.vy; if (n.x < -10) n.x = W + 10; else if (n.x > W + 10) n.x = -10; if (n.y < -10) n.y = H + 10; else if (n.y > H + 10) n.y = -10; }
      }
      for (i = 0; i < N.length; i++) for (j = i + 1; j < N.length; j++) {
        var dx = N[i].x - N[j].x, dy = N[i].y - N[j].y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < L) { cx2.strokeStyle = "rgba(255,70,60," + ((1 - d / L) * .34).toFixed(3) + ")"; cx2.lineWidth = 1; cx2.beginPath(); cx2.moveTo(N[i].x, N[i].y); cx2.lineTo(N[j].x, N[j].y); cx2.stroke(); }
      }
      for (i = 0; i < N.length; i++) {
        var a = .35 + .4 * Math.sin(t / 900 + N[i].p);
        cx2.fillStyle = "rgba(255,120,100," + a.toFixed(3) + ")"; cx2.beginPath(); cx2.arc(N[i].x, N[i].y, N[i].r, 0, 6.283); cx2.fill();
      }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
    var rt; addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { cancelAnimationFrame(raf); size(); }, 150); });
    size();
  }

  /* ---- embers ---- */
  var em = $("#embers");
  if (em && !reduce) {
    for (var q = 0; q < 16; q++) {
      var e = document.createElement("i"), s = 3 + Math.random() * 4;
      e.className = "em";
      e.style.cssText = "left:" + (2 + Math.random() * 54).toFixed(1) + "%;--s:" + s.toFixed(1) + "px;--d:" + (8 + Math.random() * 8).toFixed(1) + "s;--l:-" + (Math.random() * 12).toFixed(1) + "s;--x:" + ((Math.random() - .5) * 120).toFixed(0) + "px";
      em.appendChild(e);
    }
  }

  /* ---- gentle 3D tilt of the logo (mouse only) ---- */
  var stage = $("#stage");
  if (stage && !reduce && window.matchMedia && matchMedia("(hover:hover) and (pointer:fine)").matches) {
    addEventListener("pointermove", function (ev) {
      var nx = ev.clientX / innerWidth - .5, ny = ev.clientY / innerHeight - .5;
      stage.style.setProperty("--ry", (nx * 9).toFixed(2) + "deg");
      stage.style.setProperty("--rx", (-ny * 7).toFixed(2) + "deg");
    }, { passive: true });
  }
})();
</script>
</body>
</html>`;
}

const MF_EMBLEM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="255 100 744 860" role="img" aria-label="M&amp;F Panel"><defs>
  <linearGradient id="mfSteel" gradientUnits="userSpaceOnUse" x1="260" y1="190" x2="1000" y2="940">
    <stop offset="0" stop-color="#fbfbfb"/><stop offset=".22" stop-color="#d4d4d4"/><stop offset=".42" stop-color="#8f8f8f"/>
    <stop offset=".6" stop-color="#d9d9d9"/><stop offset=".8" stop-color="#7d7d7d"/><stop offset="1" stop-color="#3f3f3f"/></linearGradient>
  <linearGradient id="mfSteelM" gradientUnits="userSpaceOnUse" x1="360" y1="370" x2="620" y2="810">
    <stop offset="0" stop-color="#f2f2f2"/><stop offset=".22" stop-color="#a9a9a9"/><stop offset=".5" stop-color="#4a4a4a"/><stop offset=".78" stop-color="#8d8d8d"/><stop offset="1" stop-color="#d6d6d6"/></linearGradient>
  <linearGradient id="mfSteelF" gradientUnits="userSpaceOnUse" x1="640" y1="370" x2="900" y2="800">
    <stop offset="0" stop-color="#f4f4f4"/><stop offset=".3" stop-color="#b4b4b4"/><stop offset=".6" stop-color="#555"/><stop offset=".85" stop-color="#9a9a9a"/><stop offset="1" stop-color="#d0d0d0"/></linearGradient>
  <linearGradient id="mfRoofL" gradientUnits="userSpaceOnUse" x1="478" y1="265" x2="493" y2="296"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d2d2d2"/><stop offset=".65" stop-color="#8a8a8a"/><stop offset="1" stop-color="#474747"/></linearGradient>
  <linearGradient id="mfRoofR" gradientUnits="userSpaceOnUse" x1="776" y1="265" x2="761" y2="296"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".3" stop-color="#b8b8b8"/><stop offset=".65" stop-color="#6c6c6c"/><stop offset="1" stop-color="#2e2e2e"/></linearGradient>
  <linearGradient id="mfBotL" gradientUnits="userSpaceOnUse" x1="510" y1="815" x2="491" y2="845"><stop offset="0" stop-color="#e9e9e9"/><stop offset=".16" stop-color="#a2a2a2"/><stop offset=".42" stop-color="#555"/><stop offset="1" stop-color="#171717"/></linearGradient>
  <linearGradient id="mfBotR" gradientUnits="userSpaceOnUse" x1="744" y1="815" x2="763" y2="845"><stop offset="0" stop-color="#dcdcdc"/><stop offset=".16" stop-color="#939393"/><stop offset=".42" stop-color="#4a4a4a"/><stop offset="1" stop-color="#151515"/></linearGradient>
  <linearGradient id="mfLitL" gradientUnits="userSpaceOnUse" x1="340" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".55" stop-color="#bcbcbc"/><stop offset="1" stop-color="#7c7c7c"/></linearGradient>
  <linearGradient id="mfLitR" gradientUnits="userSpaceOnUse" x1="914" y1="0" x2="627" y2="0"><stop offset="0" stop-color="#e8e8e8"/><stop offset=".55" stop-color="#a6a6a6"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfSideL" gradientUnits="userSpaceOnUse" x1="306" y1="0" x2="330" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSideR" gradientUnits="userSpaceOnUse" x1="948" y1="0" x2="924" y2="0"><stop offset="0" stop-color="#b9b9b9"/><stop offset=".3" stop-color="#585858"/><stop offset="1" stop-color="#121212"/></linearGradient>
  <linearGradient id="mfSteelV" gradientUnits="userSpaceOnUse" x1="0" y1="958" x2="0" y2="1052">
    <stop offset="0" stop-color="#f6f6f6"/><stop offset=".4" stop-color="#b3b3b3"/><stop offset=".52" stop-color="#6e6e6e"/><stop offset=".8" stop-color="#3a3a3a"/><stop offset="1" stop-color="#6a6a6a"/></linearGradient>
  <linearGradient id="mfLock" gradientUnits="userSpaceOnUse" x1="568" y1="300" x2="684" y2="420">
    <stop offset="0" stop-color="#e6e6e6"/><stop offset=".45" stop-color="#8a8a8a"/><stop offset="1" stop-color="#3c3c3c"/></linearGradient>
  <linearGradient id="mfSteelR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8d8d8"/><stop offset=".5" stop-color="#6e6e6e"/><stop offset="1" stop-color="#1e1e1e"/></linearGradient>
  <radialGradient id="mfSphere" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".3" stop-color="#ee1c1c"/><stop offset=".75" stop-color="#8a0a0a"/><stop offset="1" stop-color="#3a0000"/></radialGradient>
  <radialGradient id="mfGlowNode"><stop offset=".45" stop-color="#ff2a2a" stop-opacity=".75"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfAura" cx="627" cy="545" r="430" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff1f1f" stop-opacity=".30"/><stop offset=".55" stop-color="#b30000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="mfInner" cx="627" cy="560" r="330" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2a0508"/><stop offset="1" stop-color="#060102"/></radialGradient>
  <linearGradient id="mfRedFace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfRedFaceR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff1c1c" stop-opacity=".95"/><stop offset="1" stop-color="#ff1c1c" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2a2a" stop-opacity="0"/><stop offset=".5" stop-color="#ff3a3a"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfSweepG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="mfArcFade" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="950" y2="0"><stop offset="0" stop-color="#e8e8e8" stop-opacity=".1"/><stop offset=".5" stop-color="#f4f4f4"/><stop offset="1" stop-color="#e8e8e8" stop-opacity=".1"/></linearGradient>
  <pattern id="mfBrush" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
    <rect width="6" height="1.2" fill="#fff" opacity=".14"/><rect y="3" width="6" height="1" fill="#000" opacity=".16"/></pattern>
  <filter id="mfBlur2" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="mfBlur5" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="mfBlur25" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="25"/></filter>
  <filter id="mfBlur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <clipPath id="mfMetalClip">
  <path clip-rule="evenodd" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
  <polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616"/><polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801"/><polygon points="568,298 684,298 684,376 626,425 568,376"/>
  
</clipPath>
</defs>

<g class="mf-smoke" filter="url(#mfBlur25)" opacity=".9">
  <ellipse cx="300" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/><ellipse cx="960" cy="600" rx="120" ry="190" fill="#8a0000" opacity=".30"/>
  <ellipse cx="330" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/><ellipse cx="930" cy="880" rx="150" ry="90" fill="#9a0c0c" opacity=".28"/>
</g>
<circle class="mf-aura" cx="627" cy="545" r="430" fill="url(#mfAura)"/>

<!-- constellation behind the shield -->
<g stroke="#ff3a3a" stroke-width="1.4" opacity=".55" fill="none">
<line x1="627" y1="150" x2="505" y2="268"/><line x1="627" y1="150" x2="742" y2="238"/><line x1="742" y1="238" x2="812" y2="300"/><line x1="812" y1="300" x2="925" y2="350"/><line x1="505" y1="268" x2="331" y2="350"/><line x1="870" y1="520" x2="925" y2="350"/><line x1="870" y1="520" x2="917" y2="728"/><line x1="378" y1="520" x2="331" y2="350"/><line x1="378" y1="520" x2="347" y2="722"/><line x1="470" y1="600" x2="378" y2="520"/><line x1="690" y1="640" x2="870" y2="520"/><line x1="560" y1="700" x2="470" y2="600"/><line x1="560" y1="700" x2="690" y2="640"/><line x1="505" y1="268" x2="627" y2="330"/><line x1="742" y1="238" x2="627" y2="330"/><line x1="470" y1="600" x2="550" y2="430"/><line x1="690" y1="640" x2="700" y2="450"/>
</g>
<g><path class="mf-spark" d="M505 253 L507.7 265.3 L520 268 L507.7 270.7 L505 283 L502.3 270.7 L490 268 L502.3 265.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M742 223 L744.7 235.3 L757 238 L744.7 240.7 L742 253 L739.3 240.7 L727 238 L739.3 235.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M812 285 L814.7 297.3 L827 300 L814.7 302.7 L812 315 L809.3 302.7 L797 300 L809.3 297.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M870 505 L872.7 517.3 L885 520 L872.7 522.7 L870 535 L867.3 522.7 L855 520 L867.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M378 505 L380.7 517.3 L393 520 L380.7 522.7 L378 535 L375.3 522.7 L363 520 L375.3 517.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M560 685 L562.7 697.3 L575 700 L562.7 702.7 L560 715 L557.3 702.7 L545 700 L557.3 697.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M690 625 L692.7 637.3 L705 640 L692.7 642.7 L690 655 L687.3 642.7 L675 640 L687.3 637.3Z" fill="#ff5a4a"/><path class="mf-spark" d="M470 585 L472.7 597.3 L485 600 L472.7 602.7 L470 615 L467.3 602.7 L455 600 L467.3 597.3Z" fill="#ff5a4a"/></g>

<!-- orbit ring -->
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff2a2a" stroke-width="2" opacity=".55" filter="url(#mfBlur2)"/>
<circle cx="627" cy="505" r="366" fill="none" stroke="#ff4a3a" stroke-width="1.3" opacity=".8"/>
<circle cx="627" cy="505" r="352" fill="none" stroke="#d9d9d9" stroke-width="2.2" opacity=".55"/>
<path d="M328.5 318.5 A352 352 0 0 1 553.8 160.7" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<path d="M700.2 160.7 A352 352 0 0 1 925.5 318.5" fill="none" stroke="url(#mfArcFade)" stroke-width="6" stroke-linecap="round"/>
<g class="mf-spin"><path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#ff6a5a" stroke-width="4.5" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M957.8 384.6 A352 352 0 0 1 937.8 670.3" fill="none" stroke="#fff3f0" stroke-width="2" stroke-linecap="round"/></g>
<g class="mf-spin rev"><path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ff4a3a" stroke-width="3" stroke-linecap="round" filter="url(#mfBlur2)"/>
  <path d="M310.0 688.0 A366 366 0 0 1 261.9 530.5" fill="none" stroke="#ffd0c8" stroke-width="1.4" stroke-linecap="round"/></g>

<!-- shield interior + frame -->
<polygon points="627,236 900,364 925,380 926,520 914,600 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650 340,600 329,520 329,380 354,364" fill="url(#mfInner)"/>
<g stroke="#ff3a3a" stroke-width="1.1" opacity=".35" fill="none">
  <line x1="627" y1="236" x2="470" y2="600"/><line x1="627" y1="236" x2="790" y2="640"/><line x1="470" y1="600" x2="790" y2="640"/>
  <line x1="378" y1="520" x2="627" y2="876"/><line x1="870" y1="520" x2="627" y2="876"/></g>
<polyline points="330,680 392,760 459,830 525,880 627,933 729,880 795,830 862,760 924,680" fill="none" stroke="#ff1c1c" stroke-width="9" opacity=".55" filter="url(#mfBlur5)"/>
<polyline points="330,686 392,766 459,836 525,886 627,939 729,886 795,836 862,766 924,686" fill="none" stroke="#ff3030" stroke-width="3"/>
<path fill-rule="evenodd" fill="#1a1a1c" d="M627 194 L925 336 L948 380 L948 520 L936 600 L914 660 L854 740 L787 810 L721 860 L627 913 L533 860 L467 810 L400 740 L340 660 L318 600 L306 520 L306 380 L329 336Z M627 236 L900 364 L925 380 L926 520 L914 600 L895 650 L840 725 L775 790 L710 840 L627 876 L544 840 L479 790 L414 725 L359 650 L340 600 L329 520 L329 380 L354 364Z"/>
<polygon points="329,336 627,194 627,236 354,364" fill="url(#mfRoofL)"/>
<polygon points="627,194 925,336 900,364 627,236" fill="url(#mfRoofR)"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,913 533,860 467,810 400,740 340,660" fill="#3c3c3e"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,913 721,860 787,810 854,740 914,660" fill="#343436"/>
<polygon points="359,650 414,725 479,790 544,840 627,876 627,892 535,855 470,805 405,740 350,665" fill="url(#mfLitL)"/>
<polygon points="895,650 840,725 775,790 710,840 627,876 627,892 719,855 784,805 849,740 904,665" fill="url(#mfLitR)"/>
<polygon points="350,665 405,740 470,805 535,855 627,892 627,913 533,860 467,810 400,740 340,660" fill="#1b1b1d"/>
<polygon points="904,665 849,740 784,805 719,855 627,892 627,913 721,860 787,810 854,740 914,660" fill="#171719"/>
<polygon points="306,380 329,380 329,520 340,600 359,650 340,660 318,600 306,520" fill="url(#mfSideL)"/>
<polygon points="948,380 925,380 926,520 914,600 895,650 914,660 936,600 948,520" fill="url(#mfSideR)"/>
<g fill="url(#mfBrush)">
  <polygon points="329,336 627,194 925,336 900,364 627,236 354,364"/>
  <polygon points="340,660 400,740 467,810 533,860 627,913 721,860 787,810 854,740 914,660 895,650 840,725 775,790 710,840 627,876 544,840 479,790 414,725 359,650"/>
</g>
<polyline points="329,336 306,380 306,520 318,600 340,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="925,336 948,380 948,520 936,600 914,660" fill="none" stroke="#e8e8e8" stroke-width="2" opacity=".85"/>
<polyline points="329,336 627,194 925,336" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="miter" opacity=".95"/>
<polyline points="359,650 414,725 479,790 544,840 627,876 710,840 775,790 840,725 895,650" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="miter" opacity=".9"/>

<!-- red light spilling on the inner faces -->
<polygon points="362,380 386,388 392,600 366,610" fill="url(#mfRedFace)" opacity=".75"/>
<polygon points="551,560 580,560 584,735 551,739" fill="url(#mfRedFaceR)" opacity=".0"/>
<polygon points="552,540 574,540 578,735 552,738" fill="#ff1c1c" opacity=".55" filter="url(#mfBlur5)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ff2a2a" stroke-width="3" opacity=".8" filter="url(#mfBlur2)"/>
<line x1="627" y1="430" x2="627" y2="805" stroke="#ffb0a8" stroke-width="1" opacity=".8"/>

<!-- red light in the M window and F gaps -->
<polygon points="432,452 546,520 540,540 436,484" fill="#ff1c1c" opacity=".85" filter="url(#mfBlur5)"/>
<polygon points="704,530 886,436 886,452 706,545" fill="#ff1c1c" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="704,640 862,566 862,580 706,652" fill="#ff1c1c" opacity=".65" filter="url(#mfBlur5)"/>

<!-- M -->
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfSteelM)"/>
<polygon points="362,367 450,398 614,486 617,490 617,806 551,739 550,519 419,444 437,712 360,616" fill="url(#mfBrush)"/>
<polygon points="597,492 617,490 617,806 597,786" fill="#000" opacity=".28"/>
<polyline points="362,367 450,398 614,486" fill="none" stroke="#fff" stroke-width="2.8" stroke-linejoin="miter"/>
<polyline points="419,444 550,519" fill="none" stroke="#ff2a2a" stroke-width="3" filter="url(#mfBlur2)"/>
<polyline points="419,444 437,712" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
<polyline points="437,712 360,616" fill="none" stroke="#ffb0a8" stroke-width="2.4" opacity=".9"/>
<polyline points="617,490 617,806" fill="none" stroke="#fff" stroke-width="2.2" opacity=".9"/>

<!-- F -->
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfSteelF)"/>
<polygon points="640,486 890,367 891,423 701,520 699,573 881,486 866,556 701,633 701,744 640,801" fill="url(#mfBrush)"/>
<polygon points="640,486 661,497 661,790 640,801" fill="#fff" opacity=".14"/>
<polyline points="640,486 890,367" fill="none" stroke="#fff" stroke-width="2.8"/>
<polyline points="699,573 881,486" fill="none" stroke="#fff" stroke-width="2.4" opacity=".95"/>
<polyline points="891,423 701,520" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="866,556 701,633" fill="none" stroke="#ff2a2a" stroke-width="3.2" filter="url(#mfBlur2)"/>
<polyline points="701,744 640,801" fill="none" stroke="#ffb0a8" stroke-width="2.2"/>
<polyline points="890,367 891,423" fill="none" stroke="#fff" stroke-width="2.2"/>

<!-- padlock -->
<g class="mf-shackle">
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="url(#mfLock)" stroke-width="13"/>
  <path d="M579 304 L579 288 A47 47 0 0 1 673 288 L673 304" fill="none" stroke="#fff" stroke-width="2" opacity=".55" transform="translate(-4,-4)"/>
  <path d="M591 304 L591 288 A35 35 0 0 1 661 288 L661 304" fill="none" stroke="#ff2a2a" stroke-width="4" opacity=".95" filter="url(#mfBlur2)"/>
</g>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff2a2a" stroke-width="9" opacity=".7" filter="url(#mfBlur5)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfLock)"/>
<polygon points="568,298 684,298 684,376 626,425 568,376" fill="url(#mfBrush)"/>
<polygon points="577,307 675,307 675,371 626,414 577,371" fill="none" stroke="#fff" stroke-width="1.6" opacity=".55"/>
<polyline points="568,376 626,425 684,376" fill="none" stroke="#ff3a3a" stroke-width="2.6"/>
<g class="mf-key">
  <circle cx="626" cy="332" r="19" fill="#ff1c1c" opacity=".6" filter="url(#mfBlur5)"/>
  <circle cx="626" cy="332" r="13" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.6"/>
  <path d="M619 340 L633 340 L636 386 L626 392 L616 386 Z" fill="#0c0204" stroke="#ff3a3a" stroke-width="2.4" stroke-linejoin="round"/>
</g>

<!-- orbit nodes -->
<g class="mf-node mf-n1">
  <circle cx="627" cy="150" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="627" cy="150" r="33" fill="url(#mfSteelR)"/>
  <circle cx="627" cy="150" r="27" fill="url(#mfSphere)"/>
  <circle cx="618" cy="139" r="7" fill="#fff" opacity=".35"/>
  <circle cx="627" cy="150" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="627" cy="150" r="3" fill="#fff"/>
</g><g class="mf-node mf-n2">
  <circle cx="331" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="331" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="331" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="322" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="331" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="331" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n3">
  <circle cx="925" cy="350" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="925" cy="350" r="33" fill="url(#mfSteelR)"/>
  <circle cx="925" cy="350" r="27" fill="url(#mfSphere)"/>
  <circle cx="916" cy="339" r="7" fill="#fff" opacity=".35"/>
  <circle cx="925" cy="350" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="925" cy="350" r="3" fill="#fff"/>
</g><g class="mf-node mf-n4">
  <circle cx="347" cy="722" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="347" cy="722" r="33" fill="url(#mfSteelR)"/>
  <circle cx="347" cy="722" r="27" fill="url(#mfSphere)"/>
  <circle cx="338" cy="711" r="7" fill="#fff" opacity=".35"/>
  <circle cx="347" cy="722" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="347" cy="722" r="3" fill="#fff"/>
</g><g class="mf-node mf-n5">
  <circle cx="917" cy="728" r="42" fill="url(#mfGlowNode)"/>
  <circle cx="917" cy="728" r="33" fill="url(#mfSteelR)"/>
  <circle cx="917" cy="728" r="27" fill="url(#mfSphere)"/>
  <circle cx="908" cy="717" r="7" fill="#fff" opacity=".35"/>
  <circle cx="917" cy="728" r="6" fill="#ffd9d9" filter="url(#mfBlur2)"/>
  <circle cx="917" cy="728" r="3" fill="#fff"/>
</g>



<!-- light sweep across the metal -->
<g clip-path="url(#mfMetalClip)"><g class="mf-sweep"><rect x="300" y="120" width="120" height="1000" fill="url(#mfSweepG)" transform="skewX(-18)"/></g></g>
</svg>`;

function renderSubsPage(user, configs, subUrl) {
  const esc = htmlEscape;
  const isAdmin = user.role === "admin";
  const quotaText = Number(user.trafficLimitGb) > 0 ? faDigits(user.trafficLimitGb) + " گیگابایت" : "نامحدود";
  let expiryText = "بدون انقضا";
  let expiryClass = "";
  if (user.expiresAt) {
    const days = Math.ceil((Date.parse(user.expiresAt) - Date.now()) / 86400000);
    if (days <= 0) { expiryText = "منقضی شده"; expiryClass = "bad"; }
    else { expiryText = faDigits(days) + " روز مانده"; if (days <= 3) expiryClass = "warn"; }
  }
  const active = !user.status || user.status === "active";
  const adminBox = isAdmin ? `
    <section class="panel enter" style="--i:1">
      <h2 class="panel-title">مدیریت ثبت\u200cنام (فقط ادمین)</h2>
      <div class="chips">
        <span class="chip">حالت: <b>${REGISTRATION === "open" ? "باز" : "بسته"}</b></span>
        <span class="chip">سهمیه هر کاربر جدید: <b>${USER_TRAFFIC_GB ? faDigits(USER_TRAFFIC_GB) + " گیگابایت" : "نامحدود"}</b></span>
        <span class="chip">انقضا: <b>${USER_EXPIRY_DAYS ? faDigits(USER_EXPIRY_DAYS) + " روز" : "بدون انقضا"}</b></span>
      </div>
    </section>` : "";
  const cards = configs.map((c, n) => `
      <article class="cfg enter" style="--i:${n + 4}">
        <div>
          <div class="cfg-top"><span class="cfg-name">${esc(c.name)}</span><span class="badge">${esc(c.badge)}</span></div>
          <p class="cfg-desc">${esc(c.desc)}</p>
          <div class="cfg-meta" dir="ltr"><span>Port ${esc(c.port)}</span><span>${esc(c.path)}</span></div>
        </div>
        <div class="cfg-actions">
          <button type="button" class="btn ghost" data-copy="${esc(c.uri)}" data-msg="کانفیگ کپی شد ⚡">📋 کپی کانفیگ</button>
          <button type="button" class="btn ghost" data-qr="${esc(c.uri)}" data-title="${esc(c.name)}">📱 QR Code</button>
        </div>
      </article>`).join("");
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#050304">
<title>داشبورد | ${BRAND}</title>
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<style>
:root{
  --bg:#050304; --ink:#f6efef; --muted:#a1969a; --red:#ff2a2a; --red2:#c1121f; --ember:#ff6a55;
  --card:rgba(17,11,13,.78); --line:rgba(255,90,90,.20); --field:rgba(255,255,255,.05); --warn:#ffb86b; --bad:#ff8080;
  --out:cubic-bezier(.22,1,.36,1); --soft:cubic-bezier(.45,0,.55,1);
  box-sizing:border-box; padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
}
@property --a{syntax:"<angle>";initial-value:0deg;inherits:false}
html{background:var(--bg);scroll-padding-top:env(safe-area-inset-top,0px)}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;background:var(--bg);color:var(--ink);font-family:Tahoma,"Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:radial-gradient(70% 55% at 80% 0%,#1d0508 0%,transparent 70%),radial-gradient(60% 50% at 10% 100%,#240509 0%,transparent 70%)}
.smoke{position:absolute;border-radius:50%;filter:blur(60px);opacity:.38;will-change:transform}
.s1{width:46vmax;height:46vmax;left:-14vmax;bottom:-22vmax;background:radial-gradient(circle,#b3121a,rgba(120,0,10,.35) 45%,transparent 70%);animation:dr1 40s var(--soft) infinite}
.s2{width:34vmax;height:34vmax;right:-10vmax;top:-14vmax;background:radial-gradient(circle,#7a0a12,transparent 68%);animation:dr2 46s var(--soft) infinite}
@keyframes dr1{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(5vmax,-4vmax,0) scale(1.12)}}
@keyframes dr2{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-4vmax,5vmax,0) scale(1.1)}}
#bgnet{position:absolute;inset:0;width:100%;height:100%;opacity:.7}

.container{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:6px 18px 40px}
.enter{animation:up .8s var(--out) both;animation-delay:calc(var(--i,0)*70ms + 80ms)}
@keyframes up{from{opacity:0;transform:translate3d(0,16px,0)}}

/* top bar */
.topbar{position:sticky;top:0;z-index:20;background:rgba(8,4,6,.72);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.topbar-in{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:12px 18px}
.brand{display:flex;align-items:center;gap:10px}
.brand svg{width:30px;height:33px;flex:none}
.brand b{font-size:15px;letter-spacing:.14em;background:linear-gradient(180deg,#fff 25%,#b9a9ab);-webkit-background-clip:text;background-clip:text;color:transparent}
.pill{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:99px;font-size:12.5px;color:#ffc9c2;background:rgba(255,255,255,.06);border:1px solid rgba(255,120,110,.22)}
.pill i{width:8px;height:8px;border-radius:50%;background:#ff4a3a;box-shadow:0 0 10px #ff4a3a;animation:pulse 2.4s var(--soft) infinite}
@keyframes pulse{50%{opacity:.3}}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border-radius:12px;border:1px solid var(--line);background:var(--field);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;
  transition:background .25s var(--soft),border-color .25s var(--soft),box-shadow .35s var(--out),transform .2s var(--out)}
.btn:hover{background:rgba(255,255,255,.09);border-color:rgba(255,110,100,.5)}
.btn:active{transform:scale(.97)}
.btn.primary{border:0;background:linear-gradient(90deg,var(--red2),var(--red));color:#fff;box-shadow:0 12px 28px -12px rgba(255,42,42,.8)}
.btn.primary:hover{box-shadow:0 16px 34px -12px rgba(255,42,42,.95)}
.btn.danger{color:#ff9d9d;border-color:rgba(255,100,100,.35)}
.btn.ok{background:rgba(255,106,85,.18);border-color:var(--ember);color:#fff}
.btn:focus-visible,.quick a:focus-visible{outline:3px solid rgba(255,90,80,.55);outline-offset:2px}

/* panels */
.panel,.hero,.cfg,.app{position:relative;background:var(--card);border:1px solid var(--line);border-radius:20px;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.panel{padding:16px 18px;margin-bottom:16px}
.panel-title{margin:0 0 10px;font-size:15px;font-weight:800}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:12px;background:var(--field);border:1px solid var(--line);font-size:13px;color:var(--muted)}
.chip b{color:var(--ink)}

.hero{display:grid;grid-template-columns:1fr 250px;gap:22px;align-items:center;padding:24px;margin-bottom:22px;box-shadow:0 30px 80px -34px rgba(255,30,30,.45)}
.hero::before{content:"";position:absolute;inset:-1px;border-radius:21px;padding:1.5px;pointer-events:none;
  background:conic-gradient(from var(--a),transparent 0 72%,rgba(255,110,95,.95) 86%,transparent 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:bspin 7s linear infinite}
@keyframes bspin{to{--a:360deg}}
.hero h1{margin:0 0 8px;font-size:clamp(19px,2.6vw,25px);font-weight:800}
.hero p{margin:0 0 16px;font-size:13.5px;line-height:2;color:var(--muted)}
.subbox{position:relative;overflow:hidden;display:flex;flex-wrap:wrap;gap:8px;padding:8px;border-radius:16px;background:rgba(0,0,0,.35);border:1px solid var(--line)}
.subbox::after{content:"";position:absolute;top:0;bottom:0;width:30%;left:-40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.07),transparent);transform:skewX(-20deg);animation:shine 7s var(--soft) 2s infinite;pointer-events:none}
@keyframes shine{0%{transform:translate3d(0,0,0) skewX(-20deg)}30%,100%{transform:translate3d(520%,0,0) skewX(-20deg)}}
.subbox input{flex:1 1 220px;min-width:0;height:40px;padding:0 12px;border:0;outline:0;border-radius:10px;background:transparent;color:#ffd7d1;font:13px ui-monospace,Menlo,Consolas,monospace;direction:ltr;text-align:left}
.quick{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;font-size:12.5px;color:var(--muted)}
.quick a{padding:7px 12px;border-radius:99px;background:var(--field);border:1px solid var(--line);color:var(--ink);transition:border-color .25s,background .25s}
.quick a:hover{border-color:rgba(255,110,100,.55);background:rgba(255,255,255,.09)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
.stat{padding:10px 12px;border-radius:14px;background:var(--field);border:1px solid var(--line)}
.stat small{display:block;font-size:11.5px;color:var(--muted);margin-bottom:3px}
.stat b{font-size:14px}
.stat b.warn{color:var(--warn)}.stat b.bad{color:var(--bad)}
.emblem{position:relative;width:100%;aspect-ratio:744/860;justify-self:center}
.emblem .fl{width:100%;height:100%;animation:float 8s var(--soft) 1s infinite}
@keyframes float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-8px,0)}}
.emblem svg{display:block;width:100%;height:100%;overflow:visible}

.sec{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:26px 0 12px}
.sec h2{margin:0;font-size:17px;font-weight:800}
.sec span{font-size:12.5px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}
.cfg{display:flex;flex-direction:column;justify-content:space-between;gap:14px;padding:16px;transition:transform .35s var(--out),border-color .3s var(--soft),box-shadow .4s var(--out)}
.cfg:hover{transform:translateY(-3px);border-color:rgba(255,110,100,.5);box-shadow:0 22px 44px -24px rgba(255,42,42,.65)}
.cfg-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.cfg-name{font-weight:800;font-size:15px}
.badge{padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;color:#ffd0c8;background:rgba(255,60,50,.16);border:1px solid rgba(255,100,90,.35)}
.cfg-desc{margin:0 0 10px;font-size:12.5px;line-height:1.9;color:var(--muted)}
.cfg-meta{display:flex;flex-wrap:wrap;gap:8px;font:11.5px ui-monospace,Menlo,Consolas,monospace;color:#c9a9ac}
.cfg-meta span{padding:3px 8px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid var(--line)}
.cfg-actions{display:flex;gap:8px}
.cfg-actions .btn{flex:1;height:38px;font-size:12.5px;padding:0 8px}

.apps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.app{padding:18px}
.app h3{margin:0 0 10px;font-size:15px}
.app ul{margin:0 0 12px;padding:0;list-style:none;font-size:13px;line-height:2;color:var(--muted)}
.app ul b,.step b{color:var(--ink)}
.step{padding:11px 12px;border-radius:12px;background:rgba(0,0,0,.35);border-inline-start:3px solid var(--red);font-size:12.5px;line-height:2;color:var(--muted)}
.tg{text-decoration:none;unicode-bidi:isolate;display:inline-flex;align-items:center;gap:8px;padding:6px 13px 6px 11px;border-radius:99px;font-size:12.5px;color:var(--muted);background:rgba(255,255,255,.05);border:1px solid var(--line);transition:color .25s var(--soft),border-color .25s var(--soft),box-shadow .35s var(--out),transform .2s var(--out)}
.tg svg{width:20px;height:20px;flex:none}
.tg:hover{color:#fff;border-color:rgba(255,110,100,.55);box-shadow:0 0 24px -6px rgba(255,42,42,.75)}
.tg:active{transform:scale(.96)}
.tg:focus-visible{outline:3px solid rgba(255,90,80,.55);outline-offset:2px}
.foot{margin:30px 0 0;text-align:center;font-size:12px;color:#7d7276}
.foot .tg{margin-top:12px}

/* QR modal */
.overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .3s var(--soft)}
.overlay.open{opacity:1;pointer-events:auto}
.modal{position:relative;width:min(92vw,360px);padding:22px 20px 18px;border-radius:22px;text-align:center;background:#120a0c;border:1px solid var(--line);box-shadow:0 30px 80px -20px rgba(255,30,30,.55);transform:translateY(14px) scale(.96);transition:transform .45s var(--out)}
.overlay.open .modal{transform:none}
.modal h3{margin:0 0 4px;font-size:16px}
.modal p{margin:0 0 14px;font-size:12.5px;color:var(--muted)}
.qr{display:grid;place-items:center;width:230px;max-width:100%;aspect-ratio:1;margin:0 auto 14px;padding:12px;border-radius:16px;background:#fff;box-shadow:0 0 0 4px rgba(255,60,50,.35),0 0 40px rgba(255,42,42,.45)}
.qr svg{width:100%;height:100%;display:block}
.close{position:absolute;top:10px;inset-inline-start:12px;width:32px;height:32px;border:0;border-radius:10px;background:var(--field);color:var(--ink);font-size:20px;cursor:pointer}
.toast{position:fixed;z-index:70;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);max-width:92%;padding:10px 16px;border-radius:12px;background:#1d1013;color:#fff;border:1px solid rgba(255,110,100,.45);font-size:13.5px;opacity:0;pointer-events:none;transition:opacity .25s,transform .35s var(--out)}
.toast.show{opacity:1;transform:translate(-50%,0)}

@media (max-width:820px){
  .hero{grid-template-columns:1fr;padding:18px}
  .emblem{width:min(200px,56vw);order:-1}
  .stats{grid-template-columns:1fr 1fr 1fr}
  .topbar .pill.status{display:none}
}
@media (max-width:520px){
  .container{padding:6px 12px 32px}.topbar-in{padding:10px 12px}
  .stats{gap:8px}.stat{padding:8px 9px}.stat small{font-size:10.5px}.stat b{font-size:12.5px}
  .subbox .btn{flex:1 1 140px}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
${MF_LOGO_CSS}
.mf-smoke{animation:none}
</style>
</head>
<body>
<div class="bg" aria-hidden="true"><div class="smoke s1"></div><div class="smoke s2"></div><canvas id="bgnet"></canvas></div>

<header class="topbar"><div class="topbar-in">
    <div class="brand">
      <svg viewBox="0 0 200 220" aria-hidden="true"><defs><linearGradient id="tbS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".5" stop-color="#8a8a8a"/><stop offset="1" stop-color="#3a3a3a"/></linearGradient></defs>
        <path d="M100 12 L182 56 L186 128 Q184 176 100 210 Q16 176 14 128 L18 56 Z" fill="#14050a" stroke="url(#tbS)" stroke-width="10" stroke-linejoin="round"/>
        <path d="M70 150 V78 L100 112 L130 78 V150" fill="none" stroke="#ff3a3a" stroke-width="12" stroke-linejoin="miter"/></svg>
      <b>M&amp;F PANEL</b>
      <span class="pill status"><i></i>سرور فعال</span>
    </div>
    <div class="actions">
      <span class="pill">👤 ${esc(user.username)}</span>
      ${isAdmin ? `<a href="${BASE}/" class="btn" title="ورود به پنل مدیریت سرور">⚙️ پنل ادمین</a>` : ""}
      <button type="button" class="btn danger" id="logoutBtn">خروج</button>
    </div>
</div></header>
<div class="container">
  ${adminBox}
  <section class="hero enter" style="--i:2">
    <div>
      <h1>لینک اشتراک شما</h1>
      <p>این لینک را یک‌بار در برنامه‌ی V2Ray وارد کن؛ همه‌ی کانفیگ‌های سرور خودکار دریافت و همیشه به‌روز می‌شوند.</p>
      <div class="subbox">
        <input type="text" id="subUrlInput" readonly dir="ltr" value="${esc(subUrl)}" aria-label="لینک اشتراک">
        <button type="button" class="btn primary" data-copy="${esc(subUrl)}" data-msg="لینک اشتراک کپی شد 📋">📋 کپی لینک</button>
        <button type="button" class="btn" data-qr="${esc(subUrl)}" data-title="لینک هوشمند سابسکریپشن">📷 QR Code</button>
      </div>
      <div class="quick">
        <span>اتصال سریع:</span>
        <a href="v2rayng://install-sub?url=${esc(encodeURIComponent(subUrl))}">⚡ v2rayNG</a>
        <a href="streisand://import/${esc(encodeURIComponent(subUrl))}">🍏 Streisand</a>
        <a href="v2box://install-sub?url=${esc(encodeURIComponent(subUrl))}">📦 v2box</a>
      </div>
      <div class="stats">
        <div class="stat"><small>وضعیت حساب</small><b class="${active ? "" : "bad"}">${active ? "فعال" : "غیرفعال"}</b></div>
        <div class="stat"><small>سهمیه هر کانفیگ</small><b>${quotaText}</b></div>
        <div class="stat"><small>اعتبار</small><b class="${expiryClass}">${expiryText}</b></div>
      </div>
    </div>
    <div class="emblem" aria-hidden="true"><div class="fl">${MF_EMBLEM_SVG}</div></div>
  </section>

  <div class="sec"><h2>⚡ کانفیگ‌های مجزا (اتصال دستی)</h2><span>${faDigits(configs.length)} پروتکل فعال روی پورت ${faDigits(PUBLIC_PORT)}</span></div>
  <div class="grid">${cards}
  </div>

  <div class="sec"><h2>📱 راهنمای راه‌اندازی</h2></div>
  <div class="apps">
    <article class="app enter" style="--i:11">
      <h3>🤖 اندروید</h3>
      <ul><li>برنامه <b>v2rayNG</b> (پیشنهادی)، <b>NekoBox</b> یا <b>Happ</b></li><li>از گوگل‌پلی یا گیت‌هاب</li></ul>
      <div class="step"><b>روش اتصال:</b> «کپی لینک» را بزن، v2rayNG را باز کن، از منوی سه‌نقطه به <b>Subscription group setting</b> برو و لینک را Paste کن. بعد Update Subscription را بزن.</div>
    </article>
    <article class="app enter" style="--i:12">
      <h3>🍏 آیفون</h3>
      <ul><li>برنامه <b>Streisand</b> (پیشنهادی و رایگان)</li><li>یا <b>v2box</b> و <b>Shadowrocket</b></li></ul>
      <div class="step"><b>روش اتصال:</b> Streisand یا v2box را نصب کن و دکمه‌ی «Streisand» بالا را بزن تا کانفیگ‌ها خودکار اضافه شوند؛ یا لینک را در بخش Subscription برنامه وارد کن.</div>
    </article>
    <article class="app enter" style="--i:13">
      <h3>💻 ویندوز</h3>
      <ul><li>برنامه <b>v2rayN</b> (پیشنهادی) یا <b>NekoRay</b></li><li>رایگان از GitHub</li></ul>
      <div class="step"><b>روش اتصال:</b> v2rayN را باز کن، از منوی بالا <b>Subscription group</b> ← Add را بزن، لینک را وارد کن و Update subscription را اجرا کن.</div>
    </article>
  </div>
  <div class="foot"><div>${BRAND} • ${VERSION}</div><a class="tg" href="https://t.me/M_Fpanel" target="_blank" rel="noopener noreferrer" title="ارتباط با ما در تلگرام" aria-label="تلگرام M_Fpanel"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#37aee2"/><stop offset="1" stop-color="#1e96c8"/></linearGradient></defs><circle cx="12" cy="12" r="12" fill="url(#tgG)"/><path fill="#fff" d="M5.4 11.6l11.2-4.3c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.4-.1L8.9 13.5l-2.9-.9c-.6-.2-.6-.6.1-.9z"/></svg><span dir="ltr">@M_Fpanel</span></a></div>
</div>

<div id="qrModal" class="overlay" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <button type="button" class="close" id="qrClose" aria-label="بستن">&times;</button>
    <h3 id="modalTitle">QR Code</h3>
    <p>با دوربین گوشی یا برنامه‌ی V2Ray اسکن کن</p>
    <div id="qrContainer" class="qr"></div>
    <button type="button" id="modalCopyBtn" class="btn primary" style="width:100%">📋 کپی متن</button>
  </div>
</div>
<div id="toast" class="toast" role="status">کپی شد!</div>

<script>
${QR_CODE_JS}

(function () {
  var $ = function (s) { return document.querySelector(s); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var toastTimer;

  function showToast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function copyText(text, msg, btn) {
    var done = function () {
      showToast(msg || "کپی شد!");
      if (btn) { var old = btn.innerHTML; btn.classList.add("ok"); btn.textContent = "✓ کپی شد"; setTimeout(function () { btn.classList.remove("ok"); btn.innerHTML = old; }, 1400); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); }
    else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta); done(); }
  }
  function openQr(text, title) {
    $("#modalTitle").textContent = title || "QR Code";
    var c = $("#qrContainer"); c.innerHTML = "";
    try { c.innerHTML = qrToSvg(createQRCode(text, 1), 5, 2); } catch (e) { c.textContent = "خطا در ساخت QR: " + e.message; }
    $("#modalCopyBtn").onclick = function () { copyText(text, "متن کپی شد!"); };
    $("#qrModal").classList.add("open"); $("#qrModal").setAttribute("aria-hidden", "false");
  }
  function closeQr() { $("#qrModal").classList.remove("open"); $("#qrModal").setAttribute("aria-hidden", "true"); }

  // one delegated listener: values live in data-* attributes, never inside inline JS
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-copy],[data-qr]") : null;
    if (el) {
      if (el.hasAttribute("data-copy")) copyText(el.getAttribute("data-copy"), el.getAttribute("data-msg"), el);
      else openQr(el.getAttribute("data-qr"), el.getAttribute("data-title"));
      return;
    }
    if (e.target === $("#qrModal")) closeQr();
  });
  $("#qrClose").addEventListener("click", closeQr);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeQr(); });
  $("#subUrlInput").addEventListener("focus", function () { this.select(); });

  $("#logoutBtn").addEventListener("click", async function () {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    location.href = '/login';
  });

  /* ---- faint constellation behind everything ---- */
  var cv = $("#bgnet");
  if (cv && cv.getContext) {
    var x = cv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0, N = [], raf = 0;
    var size = function () {
      W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(40, Math.max(14, W * H / 36000))); N = [];
      for (var i = 0; i < n; i++) N.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, p: Math.random() * 6.28 });
      frame(0);
    };
    var frame = function (t) {
      x.clearRect(0, 0, W, H);
      var L = Math.min(150, Math.max(90, W * .11)), i, j;
      for (i = 0; i < N.length; i++) { var n = N[i]; if (!reduce) { n.x += n.vx; n.y += n.vy; if (n.x < -10) n.x = W + 10; else if (n.x > W + 10) n.x = -10; if (n.y < -10) n.y = H + 10; else if (n.y > H + 10) n.y = -10; } }
      for (i = 0; i < N.length; i++) for (j = i + 1; j < N.length; j++) {
        var dx = N[i].x - N[j].x, dy = N[i].y - N[j].y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < L) { x.strokeStyle = "rgba(255,70,60," + ((1 - d / L) * .22).toFixed(3) + ")"; x.lineWidth = 1; x.beginPath(); x.moveTo(N[i].x, N[i].y); x.lineTo(N[j].x, N[j].y); x.stroke(); }
      }
      for (i = 0; i < N.length; i++) { x.fillStyle = "rgba(255,120,100," + (.25 + .3 * Math.sin(t / 1000 + N[i].p)).toFixed(3) + ")"; x.beginPath(); x.arc(N[i].x, N[i].y, 1.4, 0, 6.283); x.fill(); }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", function () { if (!document.hidden && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
    var rt; addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { cancelAnimationFrame(raf); size(); }, 150); });
    size();
  }
})();
</script>
</body>
</html>`;
}


// -------------------------------------------------------------
// User Portal HTTP Server & API Dispatcher (USER_PORT)
// -------------------------------------------------------------

function parseCookies(req) {
  const list = Object.create(null);
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(";").forEach((cookie) => {
      const at = cookie.indexOf("=");
      if (at < 0) return;
      const key = cookie.slice(0, at).trim();
      let val = cookie.slice(at + 1).trim();
      try { val = decodeURIComponent(val); } catch (e) { /* keep the raw value, never throw */ }
      if (key) list[key] = val;
    });
  }
  return list;
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.mf_session;
  if (!token) return null;
  const username = verifySessionToken(token);
  if (!username) return null;
  const user = findUser(username);
  return isActive(user) ? user : null;
}

// Resolves with the body text, or null when it is bigger than `limit` bytes.
function readRequestBody(req, limit = 16384) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
    req.on("close", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
  });
}

// Always returns a plain object (never null / array / primitive).
function parseBody(raw) {
  if (typeof raw !== "string") return {};
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    try { body = Object.fromEntries(new URLSearchParams(raw)); } catch (_) { return {}; }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

function tooMany(res, waitSeconds) {
  const minutes = Math.ceil(waitSeconds / 60);
  return sendJson(res, 429, {
    ok: false,
    msg: "تعداد تلاش‌ها زیاد است. حدود " + minutes + " دقیقه دیگر دوباره امتحان کنید.",
  }, { "Retry-After": String(waitSeconds) });
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  }, extraHeaders));
  res.end(body);
}

function sendHtml(res, html, extraHeaders = {}) {
  res.writeHead(200, Object.assign({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
  }, extraHeaders));
  res.end(html);
}

function sendRedirect(res, location, extraHeaders = {}) {
  res.writeHead(302, Object.assign({
    "Location": location,
    "Cache-Control": "no-store",
  }, extraHeaders));
  res.end();
}

async function handleUserPortalRequest(req, res) {
  const rawHost = (req.headers.host || "").split(":")[0];
  const hostHeader = /^[A-Za-z0-9.\-]+$/.test(rawHost) ? rawHost : "127.0.0.1";
  const effectiveHost = state.publicHost || publicHostFromEnv() || hostHeader;
  const port = PUBLIC_PORT;
  const parsedUrl = new URL(req.url, "http://" + (req.headers.host || "127.0.0.1"));
  const pathname = parsedUrl.pathname;

  // 0. Logo / favicon
  if (pathname === "/logo.svg" || pathname === "/favicon.ico") {
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Content-Length": Buffer.byteLength(MF_LOGO_SVG_STANDALONE),
      "Cache-Control": "public, max-age=86400",
    });
    return res.end(MF_LOGO_SVG_STANDALONE);
  }

  // 1. Root Router
  if (pathname === "/" || pathname === "") {
    const user = getSessionUser(req);
    if (user) return sendRedirect(res, "/sub");
    return sendRedirect(res, "/login");
  }

  // 2. Auth Pages
  if (pathname === "/login") {
    const user = getSessionUser(req);
    if (user) return sendRedirect(res, "/sub");
    return sendHtml(res, renderAuthPage("login"));
  }
  if (pathname === "/register") {
    const user = getSessionUser(req);
    if (user) return sendRedirect(res, "/sub");
    return sendHtml(res, renderAuthPage("register"));
  }

  // 3. Subscription Link Endpoint (e.g. /sub/<token>)
  const subMatch = pathname.match(/^\/sub\/([a-zA-Z0-9_\-]+)$/);
  if (subMatch) {
    const token = subMatch[1];
    const user = findUserByToken(token);
    if (!user || !isActive(user)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Subscription not found");
    }

    const ua = (req.headers["user-agent"] || "").toLowerCase();
    const isVpnApp = ua.includes("v2ray") || ua.includes("streisand") || ua.includes("v2box") ||
                     ua.includes("nekobox") || ua.includes("happ") || ua.includes("shadowrocket") ||
                     ua.includes("clash") || ua.includes("sing-box") || ua.includes("curl") ||
                     parsedUrl.searchParams.get("raw") === "1";

    if (isVpnApp) {
      const payload = generateSubscriptionPayload(user, effectiveHost, port);
      const subHeaders = {
        "Content-Type": "text/plain; charset=utf-8",
        "Profile-Update-Interval": "24",
        "Profile-Title": Buffer.from(BRAND).toString("base64"),
        "Cache-Control": "no-store, no-cache",
      };
      // Only real numbers: total/expire come from the user's limits; usage is tracked by the panel (/kb), not here.
      const lim = clientLimits(user);
      if (lim.totalGB || lim.expiryTime) {
        subHeaders["Subscription-Userinfo"] = `upload=0; download=0; total=${lim.totalGB}; expire=${Math.floor(lim.expiryTime / 1000)}`;
      }
      res.writeHead(200, subHeaders);
      return res.end(payload);
    }

    // Web browser visiting sub link directly -> log in and show dashboard!
    const sessionToken = makeSessionToken(user.username);
    const cookieHeader = `mf_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
    return sendRedirect(res, "/sub", { "Set-Cookie": cookieHeader });
  }

  // 4. User Subs Dashboard (/sub)
  if (pathname === "/sub" || pathname === "/dashboard") {
    const user = getSessionUser(req);
    if (!user) return sendRedirect(res, "/login");
    const subUrl = `http://${effectiveHost}:${port}/sub/${user.subToken}`;
    const configs = generateUserConfigs(user, effectiveHost, port);
    return sendHtml(res, renderSubsPage(user, configs, subUrl));
  }

  // 5. Auth API: Register
  if (pathname === "/api/auth/register" && req.method === "POST") {
    if (REGISTRATION === "closed") return sendJson(res, 403, { ok: false, msg: "ثبت‌نام در حال حاضر بسته است." });
    const ip = clientIp(req);
    const wait = rateLimited("reg:" + ip, 10, 3600 * 1000);
    if (wait) return tooMany(res, wait);
    rateRecord("reg:" + ip);
    const raw = await readRequestBody(req);
    if (raw === null) return sendJson(res, 413, { ok: false, msg: "درخواست بیش از حد بزرگ است." });
    const body = parseBody(raw);
    if (authInFlight >= 16) return sendJson(res, 503, { ok: false, msg: "سرور مشغول است، چند لحظه بعد دوباره امتحان کنید." });
    authInFlight++;
    try {
      const user = await createUser(body.username, body.password);
      syncUsersToInbounds().catch(() => {});
      const token = makeSessionToken(user.username);
      const cookieHeader = `mf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
      return sendJson(res, 200, { ok: true, redirect: "/sub", msg: "ثبت‌نام با موفقیت انجام شد!" }, { "Set-Cookie": cookieHeader });
    } catch (err) {
      return sendJson(res, 400, { ok: false, msg: err.message });
    } finally {
      authInFlight--;
    }
  }

  // 6. Auth API: Login
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const ip = clientIp(req);
    const waitIp = rateLimited("loginip:" + ip, 30, 15 * 60 * 1000);
    if (waitIp) return tooMany(res, waitIp);
    const raw = await readRequestBody(req);
    if (raw === null) return sendJson(res, 413, { ok: false, msg: "درخواست بیش از حد بزرگ است." });
    const body = parseBody(raw);
    const username = String(body.username == null ? "" : body.username).trim().slice(0, 64);
    const password = typeof body.password === "string" ? body.password : "";
    const userKey = "loginuser:" + username.toLowerCase();
    const waitUser = rateLimited(userKey, 10, 15 * 60 * 1000);
    if (waitUser) return tooMany(res, waitUser);
    if (authInFlight >= 16) return sendJson(res, 503, { ok: false, msg: "سرور مشغول است، چند لحظه بعد دوباره امتحان کنید." });
    authInFlight++;
    try {
      let user = findUser(username);
      if (!user && username.toLowerCase() === "admin" && password) {
        const s = readState();
        if (s.password && safeEqual(s.password, password)) {
          user = await ensureAdminUser(password);
        }
      }
      const valid = password.length > 0 && password.length <= MAX_PASSWORD_LENGTH && await verifyPassword(password, user);
      if (!valid) {
        rateRecord("loginip:" + ip);
        rateRecord(userKey);
        return sendJson(res, 400, { ok: false, msg: "نام کاربری یا رمز عبور اشتباه است." });
      }
      if (!isActive(user)) {
        return sendJson(res, 403, { ok: false, msg: "این حساب غیرفعال شده است. با مدیر تماس بگیرید." });
      }
      rateReset(userKey);
      const token = makeSessionToken(user.username);
      const cookieHeader = `mf_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
      return sendJson(res, 200, { ok: true, redirect: "/sub", msg: "ورود موفقیت‌آمیز بود!" }, { "Set-Cookie": cookieHeader });
    } finally {
      authInFlight--;
    }
  }

  // 7. Auth API: Logout
  if ((pathname === "/api/auth/logout" || pathname === "/logout")) {
    const cookieHeader = "mf_session=; Path=/; HttpOnly; Max-Age=0";
    if (req.method === "POST") return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookieHeader });
    return sendRedirect(res, "/login", { "Set-Cookie": cookieHeader });
  }

  // 8. API: User Info
  if (pathname === "/api/user/info") {
    const user = getSessionUser(req);
    if (!user) return sendJson(res, 401, { ok: false, msg: "ابتدا وارد شوید." });
    const subUrl = `http://${effectiveHost}:${port}/sub/${user.subToken}`;
    const configs = generateUserConfigs(user, effectiveHost, port);
    return sendJson(res, 200, {
      ok: true,
      user: { username: user.username, status: user.status, role: user.role },
      subUrl,
      configs,
    });
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Page Not Found");
}

let authInFlight = 0;

function startUserServer() {
  const server = http.createServer((req, res) => {
    // An exception in an async handler used to become an unhandled rejection and kill the whole process.
    handleUserPortalRequest(req, res).catch((err) => {
      log("خطا در پرتال کاربران: " + (err && err.message ? err.message : err));
      try {
        if (!res.headersSent) sendJson(res, 500, { ok: false, msg: "خطای داخلی سرور." });
        else res.end();
      } catch (e) {}
    });
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  server.on("clientError", (err, socket) => { try { socket.destroy(); } catch (e) {} });
  server.on("error", (err) => {
    log("پورت پرتال کاربران باز نشد: " + err.message);
  });
  server.listen(USER_PORT, "127.0.0.1", () => {
    log("پرتال کاربران M&F روی پورت داخلی " + USER_PORT + " آماده است.");
  });
  return server;
}


// -------------------------------------------------------------
// TCP Multiplexer & Protocol Splicing (Katabump Engine)
// -------------------------------------------------------------

function looksH2(buf) {
  return buf.length >= 14 && buf.subarray(0, 14).toString("ascii") === "PRI * HTTP/2.0";
}

function httpMethod(buf) {
  const text = buf.subarray(0, Math.min(12, buf.length)).toString("ascii");
  return /^(GET|POST|HEAD|PUT|DELETE|OPTIONS|PATCH|CONNECT) /.test(text);
}

function requestPath(buf) {
  const line = buf.toString("utf8").split(/\r?\n/, 1)[0];
  const match = line.match(/^[A-Z]+ (\S+)/);
  if (!match) return "/";
  return match[1].split("?")[0];
}

function pickPort(buf) {
  if (looksH2(buf)) return PORTS.grpc;
  if (httpMethod(buf)) {
    const reqPath = requestPath(buf);
    for (const prefix of Object.keys(PATHS)) {
      if (reqPath === prefix || reqPath.startsWith(prefix + "/")) return PATHS[prefix];
    }
    if (reqPath === BASE || reqPath.startsWith(BASE + "/")) {
      return PANEL_PORT;
    }
    return USER_PORT;
  }
  return PORTS.vless;
}

function shouldWait(buf) {
  if (buf.length < 8) return true;
  if (looksH2(buf)) return false;
  if (!httpMethod(buf)) return false;
  if (buf.includes(10)) return false;
  return buf.length < 2048;
}

function splice(socket, port, head) {
  let localPort = 0;
  const up = net.connect({ host: "127.0.0.1", port }, () => {
    if (port === USER_PORT && up.localPort) {
      localPort = up.localPort;
      clientAddrByPort.set(localPort, socket.remoteAddress || "");
    }
    if (head.length) up.write(head);
    socket.resume();
    socket.pipe(up);
    up.pipe(socket);
  });
  up.on("close", () => {
    if (localPort) clientAddrByPort.delete(localPort);
  });
  const drop = () => {
    socket.destroy();
    up.destroy();
  };
  up.on("error", drop);
  socket.on("error", drop);
}

function panelBasePath(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "") === "kb";
}

function brandAsset(buf) {
  if (!httpMethod(buf)) return null;
  const reqPath = requestPath(buf);
  const prefix = BASE + "/_alireza/";
  if (reqPath !== prefix.slice(0, -1) && !reqPath.startsWith(prefix)) return null;
  const name = reqPath.slice(prefix.length);
  const file = BRAND_FILES[name];
  if (!file) return Buffer.from("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  const body = Buffer.from(file.b64, "base64");
  return Buffer.concat([
    Buffer.from("HTTP/1.1 200 OK\r\nContent-Type: " + file.type + "\r\nCache-Control: public, max-age=86400\r\nConnection: close\r\nContent-Length: " + body.length + "\r\n\r\n"),
    body,
  ]);
}

function brandHead() {
  const base = BASE + "/";
  return "<link rel=\"stylesheet\" href=\"" + base + "_alireza/theme.css?v=2.4.0\">"
    + "<script>document.documentElement.setAttribute(\"data-alireza-theme\",\"ember\");window.ALIREZA="
    + JSON.stringify({ base: base, dns: false }).replace(/</g, "\\u003c")
    + ";</script><script defer src=\"" + base + "_alireza/brand.js?v=1.1.0\"></script>";
}

function brandHtml(html) {
  let out = String(html).replace(/<title>[^<]*<\/title>/i, "<title>" + BRAND + "</title>");
  out = out.replace(/\[VPN-UI\]/g, BRAND);
  out = out.replace(/<h1 class=\"lgt-title\">Welcome<\/h1>/g, "<h1 class=\"lgt-title\">" + BRAND + "</h1>");
  out = out.split("\\/kb\\/assets/img/logo.png").join("\\/kb\\/_alireza/logo.svg");
  out = out.split("/kb/assets/img/logo.png").join(BASE + "/_alireza/logo.svg");
  if (!out.includes("/_alireza/brand.js")) {
    if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, brandHead() + "</head>");
    else out = brandHead() + out;
  }
  return out;
}

function rewriteRequest(req) {
  const end = req.indexOf("\r\n\r\n");
  if (end < 0) return req;
  const header = req.subarray(0, end).toString("latin1")
    .split("\r\n")
    .filter((line) => !/^accept-encoding:/i.test(line) && !/^connection:/i.test(line));
  header.push("Connection: close");
  header.push("Accept-Encoding: identity");
  return Buffer.concat([Buffer.from(header.join("\r\n") + "\r\n\r\n", "latin1"), req.subarray(end + 4)]);
}

function decodeChunked(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf("\r\n", i);
    if (nl < 0) return buf;
    const size = parseInt(buf.subarray(i, nl).toString("ascii"), 16);
    if (!Number.isFinite(size)) return buf;
    if (size === 0) break;
    const start = nl + 2;
    if (start + size > buf.length) return buf;
    out.push(buf.subarray(start, start + size));
    i = start + size + 2;
  }
  return Buffer.concat(out);
}

function collectBody(sock, already, len) {
  return new Promise((resolve, reject) => {
    let buf = already;
    let settled = false;
    const cleanup = () => {
      sock.removeListener("data", onData);
      sock.removeListener("end", onEnd);
      sock.removeListener("error", onErr);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onErr = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (len != null && buf.length >= len) finish(buf.subarray(0, len));
      else if (buf.length > 1500000) onErr(new Error("html too big"));
    };
    const onEnd = () => finish(len != null ? buf.subarray(0, len) : buf);
    sock.on("data", onData);
    sock.on("end", onEnd);
    sock.on("error", onErr);
    if (len != null && buf.length >= len) finish(buf.subarray(0, len));
  });
}

function forwardPanel(socket, rawReq, port) {
  const target = port || PANEL_PORT;
  const method = rawReq.subarray(0, 8).toString("ascii").split(" ")[0].toUpperCase();
  const req = rewriteRequest(rawReq);
  const up = net.connect({ host: "127.0.0.1", port: target });
  const fail = () => {
    socket.destroy();
    up.destroy();
  };
  let decided = false;
  let headerBuf = Buffer.alloc(0);
  up.on("error", fail);
  socket.on("error", fail);
  up.on("connect", () => up.write(req));
  const passThrough = () => {
    if (!socket.destroyed) socket.write(headerBuf);
    if (up.readableEnded || up.destroyed) {
      if (!socket.destroyed) socket.end();
      return;
    }
    up.pipe(socket);
  };
  up.on("data", function onUp(chunk) {
    if (decided) return;
    headerBuf = Buffer.concat([headerBuf, chunk]);
    const end = headerBuf.indexOf("\r\n\r\n");
    if (end < 0) {
      if (headerBuf.length > 1024 * 1024) {
        decided = true;
        up.removeListener("data", onUp);
        passThrough();
      }
      return;
    }
    decided = true;
    up.removeListener("data", onUp);
    const header = headerBuf.subarray(0, end).toString("latin1");
    const rest = headerBuf.subarray(end + 4);
    const type = (header.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || "";
    const encoding = (header.match(/content-encoding:\s*([^\r\n]+)/i) || [])[1] || "";
    const chunked = /transfer-encoding:\s*chunked/i.test(header);
    const cl = header.match(/content-length:\s*(\d+)/i);
    const len = cl && !chunked ? Number(cl[1]) : null;
    const html = /text\/html/i.test(type) && method !== "HEAD";
    if (!html || (len != null && len > 1500000)) {
      passThrough();
      return;
    }
    collectBody(up, rest, len).then((body) => {
      let plain = chunked ? decodeChunked(body) : body;
      if (/gzip/i.test(encoding)) plain = zlib.gunzipSync(plain);
      else if (/deflate/i.test(encoding)) plain = zlib.inflateSync(plain);
      const branded = Buffer.from(brandHtml(plain.toString("utf8")), "utf8");
      const lines = header.split("\r\n").filter((line) => !/^(content-length|transfer-encoding|content-encoding|connection):/i.test(line));
      lines.push("Content-Length: " + branded.length);
      lines.push("Connection: close");
      if (!socket.destroyed) {
        socket.write(lines.join("\r\n") + "\r\n\r\n");
        socket.end(branded);
      }
      up.destroy();
    }).catch(() => passThrough());
  });
  up.on("end", () => {
    if (!decided && !socket.destroyed) socket.end(headerBuf);
  });
}

function brandProxy(socket, head) {
  let buf = head;
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    socket.removeListener("data", onData);
    if (buf.indexOf("\r\n\r\n") < 0) socket.destroy();
    else splice(socket, PANEL_PORT, buf);
  }, 20000);
  const onData = (chunk) => {
    if (chunk.length) buf = Buffer.concat([buf, chunk]);
    if (buf.length > 1024 * 1024) {
      settled = true;
      clearTimeout(timer);
      socket.removeListener("data", onData);
      splice(socket, PANEL_PORT, buf);
      return;
    }
    const end = buf.indexOf("\r\n\r\n");
    if (end < 0) return;
    const header = buf.subarray(0, end).toString("latin1");
    if (/^upgrade:/im.test(header)) {
      settled = true;
      clearTimeout(timer);
      socket.removeListener("data", onData);
      splice(socket, PANEL_PORT, buf);
      return;
    }
    const cl = header.match(/content-length:\s*(\d+)/i);
    const len = cl ? Number(cl[1]) : 0;
    if (/transfer-encoding:\s*chunked/i.test(header) || len > 1024 * 1024) {
      settled = true;
      clearTimeout(timer);
      socket.removeListener("data", onData);
      splice(socket, PANEL_PORT, buf);
      return;
    }
    if (buf.length < end + 4 + len) return;
    settled = true;
    clearTimeout(timer);
    socket.removeListener("data", onData);
    socket.pause();
    forwardPanel(socket, buf.subarray(0, end + 4 + len));
  };
  socket.on("data", onData);
  socket.on("error", () => socket.destroy());
  onData(Buffer.alloc(0));
  if (!settled) socket.resume();
}

function statusPage() {
  const body = "<!doctype html><html lang=\"fa\" dir=\"rtl\"><meta charset=\"utf-8\"><title>" + BRAND + "</title>"
    + "<style>body{margin:0;font-family:Tahoma,sans-serif;background:#090d16;color:#e8fff4}main{max-width:40rem;margin:8vh auto;padding:1.5rem}h1{font-size:1.4rem;color:#00f0ff}</style>"
    + "<main><h1>" + BRAND + " در حال آماده‌سازی است</h1><p>" + htmlEscape(state.status) + "</p>"
    + (state.note ? "<p>" + htmlEscape(state.note) + "</p>" : "")
    + "<p>نسخه " + VERSION + ". این صفحه هر ۸ ثانیه تازه می‌شود.</p></main>"
    + "<script>setTimeout(function(){location.reload()},8000)</script></html>";
  return "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: "
    + Buffer.byteLength(body) + "\r\n\r\n" + body;
}

function handleSocket(socket) {
  let buf = Buffer.alloc(0);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    socket.removeListener("data", onData);
    const asset = brandAsset(buf);
    if (asset) {
      socket.end(asset);
      return;
    }
    if (!state.ready) {
      if (httpMethod(buf) || buf.length === 0) socket.end(statusPage());
      else socket.destroy();
      return;
    }
    socket.pause();
    const port = pickPort(buf);
    if (port === PANEL_PORT && httpMethod(buf)) {
      brandProxy(socket, buf);
      return;
    }
    splice(socket, port, buf);
  };
  const onData = (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!state.ready) return finish();
    if (!shouldWait(buf) || buf.length >= 4096) finish();
  };
  const timer = setTimeout(finish, 2000);
  socket.on("data", onData);
  socket.on("error", () => socket.destroy());
}

function startPublicServer() {
  const server = net.createServer(handleSocket);
  server.on("error", (err) => {
    log("پورت عمومی باز نشد: " + err.message);
    process.exit(1);
  });
  server.listen(PUBLIC_PORT, "0.0.0.0", () => {
    log("پورت عمومی TCP روی " + PUBLIC_PORT + " باز است. " + VERSION);
  });
  return server;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function startPanel(env) {
  const launch = binLaunch(["run"]);
  if (state.libPath) env.LD_LIBRARY_PATH = state.libPath;
  const child = spawn(launch.command, launch.args, { cwd: VPN_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  state.child = child;
  const emit = (buf) => {
    const text = buf.toString("utf8");
    process.stdout.write(text);
    if (/extracted bundled geo|Web server running/i.test(text)) trimGeo();
    if (/panel listening/i.test(text)) state.status = "پنل بالا آمد";
  };
  child.stdout.on("data", emit);
  child.stderr.on("data", emit);
  child.on("error", (err) => log("اجرای پنل ناموفق: " + err.message));
  child.on("exit", (code, signal) => {
    state.ready = false;
    state.child = null;
    if (state.stopping) return;
    state.status = "پنل بسته شد (" + (signal || code) + "). کاتابامپ باید ری‌استارت شود.";
    log(state.status);
    process.exit(code || 1);
  });
  return child;
}

function shutdown() {
  state.stopping = true;
  if (state.child && !state.child.killed) state.child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// Safety net: log and keep serving instead of letting one bad request kill the VPN panel.
process.on("unhandledRejection", (err) => {
  log("unhandledRejection: " + (err && err.stack ? err.stack : err));
});
process.on("uncaughtException", (err) => {
  log("uncaughtException: " + (err && err.stack ? err.stack : err));
});

async function waitForPanel() {
  for (let i = 0; i < 90; i++) {
    if (state.child && state.child.exitCode != null) return false;
    if (await portOpen(PANEL_PORT)) return true;
    await sleep(1000);
  }
  return false;
}


// -------------------------------------------------------------
// Self-Tests
// -------------------------------------------------------------

async function runSelfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  assert(isPublicIp("8.8.8.8") === true, "public ip");
  assert(isPublicIp("1.1.1.1") === true, "public ip 2");
  assert(isPublicIp("10.1.2.3") === false, "private");
  assert(isPublicIp("172.18.0.4") === false, "docker");
  assert(isPublicIp("192.168.1.1") === false, "lan");
  assert(isPublicIp("127.0.0.1") === false, "loopback");

  // Routing tests
  assert(pickPort(Buffer.from("GET /kb/ HTTP/1.1\r\n")) === PANEL_PORT, "panel port");
  assert(pickPort(Buffer.from("GET /kb/setting HTTP/1.1\r\n")) === PANEL_PORT, "panel subpath");
  assert(pickPort(Buffer.from("GET / HTTP/1.1\r\n")) === USER_PORT, "user root port");
  assert(pickPort(Buffer.from("GET /login HTTP/1.1\r\n")) === USER_PORT, "user login port");
  assert(pickPort(Buffer.from("GET /sub/test HTTP/1.1\r\n")) === USER_PORT, "user sub port");
  assert(pickPort(Buffer.from("GET /bp-vless?x=1 HTTP/1.1\r\n")) === PORTS.vlessWs, "ws vless");
  assert(pickPort(Buffer.from("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")) === PORTS.grpc, "h2 grpc");
  assert(pickPort(Buffer.from("\x00\x01binary")) === PORTS.vless, "binary");

  assert(proxyField("").length === 0, "no fake host");
  assert(proxyField("8.8.8.8")[0].dest === "8.8.8.8", "host kept");

  const file = path.join(require("os").tmpdir(), "patch-selftest-" + process.pid + ".bin");
  const prefix = crypto.randomBytes(50);
  const suffix = crypto.randomBytes(20);
  fs.writeFileSync(file, Buffer.concat([prefix, PATCH_NEEDLE, suffix]));
  assert(patchBinary(file) === true, "first patch");
  assert(patchBinary(file) === false, "second patch is noop");
  const patched = fs.readFileSync(file);
  const at = patched.indexOf(PATCH_NEEDLE.subarray(0, PATCH_NEEDLE.length - 6));
  assert(patched.subarray(at + PATCH_NEEDLE.length - 6, at + PATCH_NEEDLE.length).equals(PATCH_JUMP), "jump bytes");
  fs.rmSync(file, { force: true });

  const keys = wgKeyPair();
  assert(Buffer.from(keys.secretKey, "base64").length === 32, "wg key");

  const branded = brandHtml("<html><head><title>1.2.3.4 – Welcome</title></head><body><p class=\"lgt-brand\">[VPN-UI]</p><h1 class=\"lgt-title\">Welcome</h1><script>var x='VPN-UI';</script></body></html>");
  assert(branded.includes("<title>" + BRAND + "</title>"), "title");
  assert(branded.includes(">" + BRAND + "</p>"), "brand text");
  assert(branded.includes("<h1 class=\"lgt-title\">" + BRAND + "</h1>"), "welcome replaced");
  assert(panelBasePath("/kb/") && panelBasePath("kb") && !panelBasePath("/x/"), "base path");

  const logo = brandAsset(Buffer.from("GET /kb/_alireza/logo.svg HTTP/1.1\r\nHost: x\r\n\r\n"));
  assert(logo && logo.includes("image/svg+xml") && logo.includes("<svg"), "logo asset");

  // User auth test
  const testUser = { salt: "aabbcc", hash: (await hashPassword("mypass", "aabbcc")).hash };
  assert((await verifyPassword("mypass", testUser)) === true, "password check");
  assert((await verifyPassword("wrong", testUser)) === false, "wrong password check");
  assert((await verifyPassword("mypass", null)) === false, "unknown user check");
  // hashes created by the old synchronous code must still verify
  const legacy = { salt: "ffee11", hash: crypto.scryptSync("legacy-pass", "ffee11", 32).toString("hex") };
  assert((await verifyPassword("legacy-pass", legacy)) === true, "legacy hash compatible");

  // Body / cookie parsing must never throw
  assert(JSON.stringify(parseBody("null")) === "{}", "null body");
  assert(JSON.stringify(parseBody("[1,2]")) === "{}", "array body");
  assert(parseBody('{"a":1}').a === 1, "json body");
  assert(parseBody("username=a&password=b").username === "a", "form body");
  assert(parseCookies({ headers: { cookie: "a=%; mf_session=tok" } }).mf_session === "tok", "bad cookie does not throw");

  // Rate limiter
  rateReset("t");
  for (let i = 0; i < 3; i++) { assert(rateLimited("t", 3, 60000) === 0, "limiter allows"); rateRecord("t"); }
  assert(rateLimited("t", 3, 60000) > 0, "limiter blocks");
  rateReset("t");
  assert(rateLimited("t", 3, 60000) === 0, "limiter reset");

  // Subscription payload must be one URI per line
  const lines = Buffer.from(generateSubscriptionPayload({ id: "11111111-1111-1111-1111-111111111111" }, "1.2.3.4", 8080), "base64").toString().split("\n");
  assert(lines.length === 6 && lines.every((l) => /^(vless|vmess|trojan):\/\//.test(l)), "sub payload lines");

  // Pinned downloads and helper binary
  assert(GLIBC_DEBS.length === 3 && GLIBC_DEBS.every((d) => d[0].startsWith("https://") && /^[0-9a-f]{64}$/.test(d[2])), "pinned debs");
  assert(crypto.createHash("sha256").update(Buffer.from(FADVISE_B64, "base64")).digest("hex") === FADVISE_SHA, "dropcache hash");
  assert(safeEqual("abc", "abc") && !safeEqual("abc", "abd"), "safeEqual");

  // New login page: logo inline, register UI follows the registration mode, no external requests
  const loginHtml = renderAuthPage("login");
  assert(loginHtml.includes('aria-label="M&amp;F Panel"') && loginHtml.includes("mf-spin"), "login page embeds the animated logo");
  assert((REGISTRATION === "closed") === !loginHtml.includes('data-mode="register"'), "register switch hidden only when closed");
  assert(!loginHtml.includes('name="invite"') && !loginHtml.includes("کد دعوت"), "no invite field or wording on the login page");
  assert(!/(?:src|href)=["']https?:\/\/(?!www\.w3\.org|t\.me\/M_Fpanel")/.test(loginHtml) && !/url\(https?:/.test(loginHtml) && !/@import/.test(loginHtml), "login page has no external resources");
  assert(MF_LOGO_SVG_STANDALONE.startsWith("<svg") && MF_LOGO_SVG_STANDALONE.includes("<style>"), "standalone logo svg");
  const remarks = ["VLESS-TCP", "Trojan-TCP", "VLESS-WS", "VMess-WS", "Trojan-WS", "VLESS-gRPC", "VLESS-HTTPUpgrade"];
  const mails = remarks.map((r, n) => emailFor({ username: "alice" }, { id: n + 1, remark: r }));
  assert(new Set(mails).size === remarks.length && mails.every((x) => /^alice-[a-z0-9-]+$/.test(x)), "client e-mails unique per inbound");

  // Dashboard must render (it used to throw: QR_CODE_JS is not defined) and ship a working QR generator
  const dashUser = { id: "11111111-1111-1111-1111-111111111111", username: "u", role: "user" };
  const dashHtml = renderSubsPage(dashUser, generateUserConfigs(dashUser, "1.2.3.4", 8080), "http://1.2.3.4:8080/sub/t");
  assert(dashHtml.includes("function createQRCode") && dashHtml.includes("function qrToSvg"), "dashboard embeds QR generator");
  const qrBox = {};
  require("vm").runInNewContext(QR_CODE_JS + "\nthis.svg = qrToSvg(createQRCode('http://1.2.3.4:8080/sub/t', 1), 5, 2);", qrBox);
  assert(typeof qrBox.svg === "string" && qrBox.svg.startsWith("<svg") && qrBox.svg.includes("<path"), "embedded QR source works standalone");

  // New dashboard: no inline-JS handlers carrying data, admin-only parts stay admin-only
  assert(!dashHtml.includes("onclick=") && (dashHtml.match(/data-copy=/g) || []).length >= 7 && dashHtml.includes("mf-spin"), "dashboard uses data-* handlers and the animated emblem");
  assert(!dashHtml.includes("پنل ادمین") && !dashHtml.includes("فقط ادمین"), "dashboard hides admin parts from normal users");
  const adminDashHtml = renderSubsPage({ id: dashUser.id, username: "boss", role: "admin" }, generateUserConfigs(dashUser, "1.2.3.4", 8080), "http://1.2.3.4:8080/sub/t");
  assert(adminDashHtml.includes("پنل ادمین") && adminDashHtml.includes("فقط ادمین"), "dashboard shows admin parts to admins");
  assert(!dashHtml.includes("کد دعوت") && !adminDashHtml.includes("کد دعوت"), "no invite wording on the dashboard");
  // a typo inside a template string is invisible to `node --check`: parse every inline <script> of every page
  for (const [pageName, pageHtml] of [["login", loginHtml], ["register", renderAuthPage("register")], ["dashboard", dashHtml], ["admin dashboard", adminDashHtml]]) {
    const scripts = [...pageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
    assert(scripts.length > 0, pageName + " page has an inline script");
    scripts.forEach((code) => { try { new (require("vm").Script)(code); } catch (e) { throw new Error("inline script of the " + pageName + " page does not parse: " + e.message); } });
  }
  assert(!/(?:src|href)=["']https?:\/\/(?!www\.w3\.org|t\.me\/M_Fpanel")/.test(dashHtml) && !/@import|url\(https?:/.test(dashHtml), "dashboard has no external resources");

  // Session test
  state.sessionSecret = "test-secret";
  const token = makeSessionToken("testuser");
  assert(verifySessionToken(token) === "testuser", "session token");
  assert(verifySessionToken(token + "x") === null, "tampered session token");

  // QR test
  const qr = createQRCode("test-qr", 1);
  const svg = qrToSvg(qr);
  assert(svg.includes("<svg") && svg.includes("<rect"), "qr svg");

  log("selftest ok");
}

function socketPair() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const connected = new Promise((done) => server.once("connection", done));
      const client = net.connect(port, "127.0.0.1");
      client.once("error", reject);
      connected.then((remote) => resolve({
        client,
        remote,
        close() {
          server.close();
          client.destroy();
          remote.destroy();
        },
      }));
    });
  });
}

function readEnded(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("error", reject);
  });
}

async function runBrandProxyTest() {
  const mock = http.createServer((req, res) => {
    if (req.url === "/json") {
      res.setHeader("Content-Type", "application/json");
      res.end("{\"ok\":true,\"name\":\"VPN-UI\"}");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<html><head><title>9.9.9.9 – Welcome</title></head><body><p>[VPN-UI]</p></body></html>");
  });
  await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
  const port = mock.address().port;
  const htmlPair = await socketPair();
  const htmlDone = readEnded(htmlPair.client);
  forwardPanel(htmlPair.remote, Buffer.from("GET /kb/ HTTP/1.1\r\nHost: x\r\nAccept-Encoding: gzip\r\n\r\n"), port);
  const html = await htmlDone;
  if (!html.includes("<title>" + BRAND + "</title>")) throw new Error("proxied title missing");
  if (!html.includes("/_alireza/brand.js")) throw new Error("proxied script missing");
  if (!html.includes(">" + BRAND + "</p>")) throw new Error("proxied brand missing");
  htmlPair.close();
  await new Promise((resolve) => mock.close(resolve));
  log("brand proxy ok");
}

// -------------------------------------------------------------
// Main Application Entry Point
// -------------------------------------------------------------

async function main() {
  if (!Number.isInteger(PUBLIC_PORT) || PUBLIC_PORT < 1 || PUBLIC_PORT > 65535) {
    log("SERVER_PORT نامعتبر است: " + process.env.SERVER_PORT);
    process.exit(1);
  }
  if (process.arch !== "x64" || process.platform !== "linux") {
    log("این پنل فقط روی لینوکس amd64 اجرا می‌شود. این محیط: " + process.platform + "/" + process.arch);
    process.exit(1);
  }
  ensureDirs();
  startPublicServer();
  startUserServer();

  const limit = cgroupLimit();
  const mb = limit ? Math.floor(limit / (1024 * 1024)) : 0;
  log("حافظه کانتینر: " + (mb ? mb + "MB" : "نامشخص") + ". حالت بیکار این پنل حدود ۳۸۰ مگابایت است.");
  if (mb && mb < 700) {
    state.note = "رم این پلن " + mb + " مگابایت است. فایل‌های اضافی پاک می‌شوند تا پنل گیر نکند. اگر باز هم بسته شد، رم را به ۱ گیگابایت برسانید.";
    log("هشدار: " + state.note);
  }
  state.status = "در حال بررسی دیسک";
  const free = diskFree(ROOT);
  const haveBin = fs.existsSync(BIN);
  const need = haveBin ? 20 * 1024 * 1024 : 420 * 1024 * 1024;
  if (free && free < need) {
    state.status = "دیسک کم است. فایل‌های قدیمی را پاک کنید. حداقل " + Math.ceil(need / (1024 * 1024)) + " مگابایت خالی لازم است.";
    log(state.status);
    return;
  }
  state.status = "در حال آماده کردن فایل پنل";
  const binaryState = await ensureBinary();
  log(binaryState === "downloaded" ? "پنل دانلود و برای کاتابامپ آماده شد." : "باینری آماده است و دوباره دانلود نشد.");
  if (needsBundledGlibc()) {
    const runtime = await ensureRuntime();
    log(runtime === "downloaded" ? "گلیبک سازگار کنار پنل گذاشته شد." : "گلیبک سازگار از قبل موجود است و دوباره دانلود نشد.");
    const linked = linkLoader();
    if (linked) {
      try {
        const changed = patchInterpreter(BIN, linked);
        state.directExec = true;
        log(changed ? "پنل مستقیم اجرا می‌شود تا بعد از دانلود گیر نکند." : "پنل از قبل برای اجرای مستقیم آماده است.");
      } catch (e) {
        state.directExec = false;
        log("اجرای مستقیم نشد: " + e.message);
      }
    }
  }
  dropFileCache(BIN);

  const saved = readState();
  const first = !saved.password;
  let username = saved.username || "admin";
  let password = saved.password || randomPassword();
  const env = panelEnv(limit);
  state.status = "در حال نوشتن تنظیم پنل";
  const settingArgs = ["setting", "-port", String(PANEL_PORT), "-listenIP", "127.0.0.1", "-webBasePath", "kb"];
  if (first) settingArgs.push("-username", username, "-password", password);
  const setting = await runBin(settingArgs, env, 90000);
  if (setting.code !== 0) {
    const detail = setting.out.trim().split(/\r?\n/).filter(Boolean).slice(-4).join(" | ").slice(0, 500);
    state.status = "تنظیم پنل شکست خورد: " + (detail || ("کد " + setting.code));
    log(setting.out.slice(-1500));
    throw new Error(state.status);
  }
  if (first && /Failed to update username and password/i.test(setting.out)) {
    log("رمز تصادفی اعمال نشد. ورود اولیه admin / admin است.");
    username = "admin";
    password = "admin";
  }
  if (first) writeState({ username, password, version: VERSION });
  state.publicHost = await detectPublicHost();
  if (!state.publicHost) {
    log("IP عمومی پیدا نشد. PANEL_HOST را در Environment بگذارید و ری‌استارت کنید، وگرنه لینک‌ها آدرس داخلی می‌گیرند.");
  }
  writeAccess({ host: state.publicHost, username, password });
  noteRegistration();
  state.status = "در حال بالا آوردن پنل";
  startPanel(env);
  const up = await waitForPanel();
  if (!up) throw new Error("پنل روی پورت داخلی بالا نیامد");
  state.ready = true;
  state.status = "پنل باز است";
  log("پنل مدیریت آماده است: http://" + (state.publicHost || "IP-سرور") + ":" + PUBLIC_PORT + BASE + "/");
  log("پرتال کاربران و ساب آماده است: http://" + (state.publicHost || "IP-سرور") + ":" + PUBLIC_PORT + "/");
  if (first) log("مدیر: " + username + "    رمز اولیه: " + password);
  else log("رمز اولیه در vpn/PANEL.txt است. اگر آن را عوض کرده‌اید، همان رمز جدید را بزنید.");
  log("حالت ثبت\u200cنام: " + (REGISTRATION === "open" ? "باز (هر کسی می‌تواند ثبت\u200cنام کند)" : "بسته"));
  if (USER_TRAFFIC_GB || USER_EXPIRY_DAYS) log("سهمیه کاربران جدید: " + (USER_TRAFFIC_GB || "نامحدود") + " گیگابایت، " + (USER_EXPIRY_DAYS || "بدون") + " روز اعتبار");
  try {
    const seeded = await seed(username, password, state.publicHost);
    log("اینباندها: " + seeded.made.join("، "));
    if (seeded.skipped.length) log("ساخته نشد: " + seeded.skipped.join(" | "));
  } catch (e) {
    log("تنظیم خودکار اینباند کامل نشد، ولی خود پنل باز است: " + e.message);
  }
  log("WireGuard قابل استفاده اینباند WireGuard است. WireGuard (C)، AmneziaWG، OpenVPN، L2TP، PPTP، IKEv2، SSTP، OpenConnect و GRE در این کانتینر کرنل ندارند و ساخته نمی‌شوند.");
}

if (process.env.SELFTEST === "1") {
  (async () => {
    try {
      await runSelfTest();
      await runBrandProxyTest();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
} else {
  main().catch((err) => {
    state.status = "خطا: " + err.message;
    log(state.status);
    setInterval(() => {}, 1000);
  });
}


function loadFzstd() {
  const exports = {};
"use strict";
// Some numerical data is initialized as -1 even when it doesn't need initialization to help the JIT infer types
// aliases for shorter compressed code (most minifers don't do this)
var ab = ArrayBuffer, u8 = Uint8Array, u16 = Uint16Array, i16 = Int16Array, u32 = Uint32Array, i32 = Int32Array;
var slc = function (v, s, e) {
    if (u8.prototype.slice)
        return u8.prototype.slice.call(v, s, e);
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    var n = new u8(e - s);
    n.set(v.subarray(s, e));
    return n;
};
var fill = function (v, n, s, e) {
    if (u8.prototype.fill)
        return u8.prototype.fill.call(v, n, s, e);
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    for (; s < e; ++s)
        v[s] = n;
    return v;
};
var cpw = function (v, t, s, e) {
    if (u8.prototype.copyWithin)
        return u8.prototype.copyWithin.call(v, t, s, e);
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    while (s < e) {
        v[t++] = v[s++];
    }
};
/**
 * Codes for errors generated within this library
 */
exports.ZstdErrorCode = {
    InvalidData: 0,
    WindowSizeTooLarge: 1,
    InvalidBlockType: 2,
    FSEAccuracyTooHigh: 3,
    DistanceTooFarBack: 4,
    UnexpectedEOF: 5
};
// error codes
var ec = [
    'invalid zstd data',
    'window size too large (>2046MB)',
    'invalid block type',
    'FSE accuracy too high',
    'match distance too far back',
    'unexpected EOF'
];
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
var rb = function (d, b, n) {
    var i = 0, o = 0;
    for (; i < n; ++i)
        o |= d[b++] << (i << 3);
    return o;
};
var b4 = function (d, b) { return (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0; };
// read Zstandard frame header
var rzfh = function (dat, w) {
    var n3 = dat[0] | (dat[1] << 8) | (dat[2] << 16);
    if (n3 == 0x2FB528 && dat[3] == 253) {
        // Zstandard
        var flg = dat[4];
        //    single segment       checksum             dict flag     frame content flag
        var ss = (flg >> 5) & 1, cc = (flg >> 2) & 1, df = flg & 3, fcf = flg >> 6;
        if (flg & 8)
            err(0);
        // byte
        var bt = 6 - ss;
        // dict bytes
        var db = df == 3 ? 4 : df;
        // dictionary id
        var di = rb(dat, bt, db);
        bt += db;
        // frame size bytes
        var fsb = fcf ? (1 << fcf) : ss;
        // frame source size
        var fss = rb(dat, bt, fsb) + ((fcf == 1) && 256);
        // window size
        var ws = fss;
        if (!ss) {
            // window descriptor
            var wb = 1 << (10 + (dat[5] >> 3));
            ws = wb + (wb >> 3) * (dat[5] & 7);
        }
        if (ws > 2145386496)
            err(1);
        var buf = new u8((w == 1 ? (fss || ws) : w ? 0 : ws) + 12);
        buf[0] = 1, buf[4] = 4, buf[8] = 8;
        return {
            b: bt + fsb,
            y: 0,
            l: 0,
            d: di,
            w: (w && w != 1) ? w : buf.subarray(12),
            e: ws,
            o: new i32(buf.buffer, 0, 3),
            u: fss,
            c: cc,
            m: Math.min(131072, ws)
        };
    }
    else if (((n3 >> 4) | (dat[3] << 20)) == 0x184D2A5) {
        // skippable
        return b4(dat, 4) + 8;
    }
    err(0);
};
// most significant bit for nonzero
var msb = function (val) {
    var bits = 0;
    for (; (1 << bits) <= val; ++bits)
        ;
    return bits - 1;
};
// read finite state entropy
var rfse = function (dat, bt, mal) {
    // table pos
    var tpos = (bt << 3) + 4;
    // accuracy log
    var al = (dat[bt] & 15) + 5;
    if (al > mal)
        err(3);
    // size
    var sz = 1 << al;
    // probabilities symbols  repeat   index   high threshold
    var probs = sz, sym = -1, re = -1, i = -1, ht = sz;
    // optimization: single allocation is much faster
    var buf = new ab(512 + (sz << 2));
    var freq = new i16(buf, 0, 256);
    // same view as freq
    var dstate = new u16(buf, 0, 256);
    var nstate = new u16(buf, 512, sz);
    var bb1 = 512 + (sz << 1);
    var syms = new u8(buf, bb1, sz);
    var nbits = new u8(buf, bb1 + sz);
    while (sym < 255 && probs > 0) {
        var bits = msb(probs + 1);
        var cbt = tpos >> 3;
        // mask
        var msk = (1 << (bits + 1)) - 1;
        var val = ((dat[cbt] | (dat[cbt + 1] << 8) | (dat[cbt + 2] << 16)) >> (tpos & 7)) & msk;
        // mask (1 fewer bit)
        var msk1fb = (1 << bits) - 1;
        // max small value
        var msv = msk - probs - 1;
        // small value
        var sval = val & msk1fb;
        if (sval < msv)
            tpos += bits, val = sval;
        else {
            tpos += bits + 1;
            if (val > msk1fb)
                val -= msv;
        }
        freq[++sym] = --val;
        if (val == -1) {
            probs += val;
            syms[--ht] = sym;
        }
        else
            probs -= val;
        if (!val) {
            do {
                // repeat byte
                var rbt = tpos >> 3;
                re = ((dat[rbt] | (dat[rbt + 1] << 8)) >> (tpos & 7)) & 3;
                tpos += 2;
                sym += re;
            } while (re == 3);
        }
    }
    if (sym > 255 || probs)
        err(0);
    var sympos = 0;
    // sym step (coprime with sz - formula from zstd source)
    var sstep = (sz >> 1) + (sz >> 3) + 3;
    // sym mask
    var smask = sz - 1;
    for (var s = 0; s <= sym; ++s) {
        var sf = freq[s];
        if (sf < 1) {
            dstate[s] = -sf;
            continue;
        }
        // This is split into two loops in zstd to avoid branching, but as JS is higher-level that is unnecessary
        for (i = 0; i < sf; ++i) {
            syms[sympos] = s;
            do {
                sympos = (sympos + sstep) & smask;
            } while (sympos >= ht);
        }
    }
    // After spreading symbols, should be zero again
    if (sympos)
        err(0);
    for (i = 0; i < sz; ++i) {
        // next state
        var ns = dstate[syms[i]]++;
        // num bits
        var nb = nbits[i] = al - msb(ns);
        nstate[i] = (ns << nb) - sz;
    }
    return [(tpos + 7) >> 3, {
            b: al,
            s: syms,
            n: nbits,
            t: nstate
        }];
};
// read huffman
var rhu = function (dat, bt) {
    //  index  weight count
    var i = 0, wc = -1;
    //    buffer             header byte
    var buf = new u8(292), hb = dat[bt];
    // huffman weights
    var hw = buf.subarray(0, 256);
    // rank count
    var rc = buf.subarray(256, 268);
    // rank index
    var ri = new u16(buf.buffer, 268);
    // NOTE: at this point bt is 1 less than expected
    if (hb < 128) {
        // end byte, fse decode table
        var _a = rfse(dat, bt + 1, 6), ebt = _a[0], fdt = _a[1];
        bt += hb;
        var epos = ebt << 3;
        // last byte
        var lb = dat[bt];
        if (!lb)
            err(0);
        //  state1   state2   state1 bits   state2 bits
        var st1 = 0, st2 = 0, btr1 = fdt.b, btr2 = btr1;
        // fse pos
        // pre-increment to account for original deficit of 1
        var fpos = (++bt << 3) - 8 + msb(lb);
        for (;;) {
            fpos -= btr1;
            if (fpos < epos)
                break;
            var cbt = fpos >> 3;
            st1 += ((dat[cbt] | (dat[cbt + 1] << 8)) >> (fpos & 7)) & ((1 << btr1) - 1);
            hw[++wc] = fdt.s[st1];
            fpos -= btr2;
            if (fpos < epos)
                break;
            cbt = fpos >> 3;
            st2 += ((dat[cbt] | (dat[cbt + 1] << 8)) >> (fpos & 7)) & ((1 << btr2) - 1);
            hw[++wc] = fdt.s[st2];
            btr1 = fdt.n[st1];
            st1 = fdt.t[st1];
            btr2 = fdt.n[st2];
            st2 = fdt.t[st2];
        }
        if (++wc > 255)
            err(0);
    }
    else {
        wc = hb - 127;
        for (; i < wc; i += 2) {
            var byte = dat[++bt];
            hw[i] = byte >> 4;
            hw[i + 1] = byte & 15;
        }
        ++bt;
    }
    // weight exponential sum
    var wes = 0;
    for (i = 0; i < wc; ++i) {
        var wt = hw[i];
        // bits must be at most 11, same as weight
        if (wt > 11)
            err(0);
        wes += wt && (1 << (wt - 1));
    }
    // max bits
    var mb = msb(wes) + 1;
    // table size
    var ts = 1 << mb;
    // remaining sum
    var rem = ts - wes;
    // must be power of 2
    if (rem & (rem - 1))
        err(0);
    hw[wc++] = msb(rem) + 1;
    for (i = 0; i < wc; ++i) {
        var wt = hw[i];
        ++rc[hw[i] = wt && (mb + 1 - wt)];
    }
    // huf buf
    var hbuf = new u8(ts << 1);
    //    symbols                      num bits
    var syms = hbuf.subarray(0, ts), nb = hbuf.subarray(ts);
    ri[mb] = 0;
    for (i = mb; i > 0; --i) {
        var pv = ri[i];
        fill(nb, i, pv, ri[i - 1] = pv + rc[i] * (1 << (mb - i)));
    }
    if (ri[0] != ts)
        err(0);
    for (i = 0; i < wc; ++i) {
        var bits = hw[i];
        if (bits) {
            var code = ri[bits];
            fill(syms, i, code, ri[bits] = code + (1 << (mb - bits)));
        }
    }
    return [bt, {
            n: nb,
            b: mb,
            s: syms
        }];
};
// Tables generated using this:
// https://gist.github.com/101arrowz/a979452d4355992cbf8f257cbffc9edd
// default literal length table
var dllt = /*#__PURE__*/ rfse(/*#__PURE__*/ new u8([
    81, 16, 99, 140, 49, 198, 24, 99, 12, 33, 196, 24, 99, 102, 102, 134, 70, 146, 4
]), 0, 6)[1];
// default match length table
var dmlt = /*#__PURE__*/ rfse(/*#__PURE__*/ new u8([
    33, 20, 196, 24, 99, 140, 33, 132, 16, 66, 8, 33, 132, 16, 66, 8, 33, 68, 68, 68, 68, 68, 68, 68, 68, 36, 9
]), 0, 6)[1];
// default offset code table
var doct = /*#__PURE__ */ rfse(/*#__PURE__*/ new u8([
    32, 132, 16, 66, 102, 70, 68, 68, 68, 68, 36, 73, 2
]), 0, 5)[1];
// bits to baseline
var b2bl = function (b, s) {
    var len = b.length, bl = new i32(len);
    for (var i = 0; i < len; ++i) {
        bl[i] = s;
        s += 1 << b[i];
    }
    return bl;
};
// literal length bits
var llb = /*#__PURE__ */ new u8(( /*#__PURE__ */new i32([
    0, 0, 0, 0, 16843009, 50528770, 134678020, 202050057, 269422093
])).buffer, 0, 36);
// literal length baseline
var llbl = /*#__PURE__ */ b2bl(llb, 0);
// match length bits
var mlb = /*#__PURE__ */ new u8(( /*#__PURE__ */new i32([
    0, 0, 0, 0, 0, 0, 0, 0, 16843009, 50528770, 117769220, 185207048, 252579084, 16
])).buffer, 0, 53);
// match length baseline
var mlbl = /*#__PURE__ */ b2bl(mlb, 3);
// decode huffman stream
var dhu = function (dat, out, hu) {
    var len = dat.length, ss = out.length, lb = dat[len - 1], msk = (1 << hu.b) - 1, eb = -hu.b;
    if (!lb)
        err(0);
    var st = 0, btr = hu.b, pos = (len << 3) - 8 + msb(lb) - btr, i = -1;
    for (; pos > eb && i < ss;) {
        var cbt = pos >> 3;
        var val = (dat[cbt] | (dat[cbt + 1] << 8) | (dat[cbt + 2] << 16)) >> (pos & 7);
        st = ((st << btr) | val) & msk;
        out[++i] = hu.s[st];
        pos -= (btr = hu.n[st]);
    }
    if (pos != eb || i + 1 != ss)
        err(0);
};
// decode huffman stream 4x
var dhu4 = function (dat, out, hu) {
    var bt = 6;
    var ss = out.length, sz1 = (ss + 3) >> 2, sz2 = sz1 << 1, sz3 = sz1 + sz2;
    dhu(dat.subarray(bt, bt += dat[0] | (dat[1] << 8)), out.subarray(0, sz1), hu);
    dhu(dat.subarray(bt, bt += dat[2] | (dat[3] << 8)), out.subarray(sz1, sz2), hu);
    dhu(dat.subarray(bt, bt += dat[4] | (dat[5] << 8)), out.subarray(sz2, sz3), hu);
    dhu(dat.subarray(bt), out.subarray(sz3), hu);
};
// read Zstandard block
var rzb = function (dat, st, out) {
    var _a;
    var bt = st.b;
    var b0 = dat[bt], btype = (b0 >> 1) & 3;
    st.l = b0 & 1;
    var sz = (b0 >> 3) | (dat[bt + 1] << 5) | (dat[bt + 2] << 13);
    var ebt = (bt += 3) + sz;
    if (btype == 1) {
        if (bt >= dat.length)
            return;
        st.b = bt + 1;
        if (out) {
            fill(out, dat[bt], st.y, st.y += sz);
            return out;
        }
        return fill(new u8(sz), dat[bt]);
    }
    if (ebt > dat.length)
        return;
    if (btype == 0) {
        st.b = ebt;
        if (out) {
            out.set(dat.subarray(bt, ebt), st.y);
            st.y += sz;
            return out;
        }
        return slc(dat, bt, ebt);
    }
    if (btype == 2) {
        var b3 = dat[bt], lbt = b3 & 3, sf = (b3 >> 2) & 3;
        var lss = b3 >> 4, lcs = 0, s4 = 0;
        if (lbt < 2) {
            if (sf & 1)
                lss |= (dat[++bt] << 4) | ((sf & 2) && (dat[++bt] << 12));
            else
                lss = b3 >> 3;
        }
        else {
            s4 = sf;
            if (sf < 2)
                lss |= ((dat[++bt] & 63) << 4), lcs = (dat[bt] >> 6) | (dat[++bt] << 2);
            else if (sf == 2)
                lss |= (dat[++bt] << 4) | ((dat[++bt] & 3) << 12), lcs = (dat[bt] >> 2) | (dat[++bt] << 6);
            else
                lss |= (dat[++bt] << 4) | ((dat[++bt] & 63) << 12), lcs = (dat[bt] >> 6) | (dat[++bt] << 2) | (dat[++bt] << 10);
        }
        ++bt;
        var buf = out ? out.subarray(st.y, st.y + st.m) : new u8(st.m);
        var spl = buf.length - lss;
        if (lbt == 0)
            buf.set(dat.subarray(bt, bt += lss), spl);
        else if (lbt == 1)
            fill(buf, dat[bt++], spl);
        else {
            var hu = st.h;
            if (lbt == 2) {
                var hud = rhu(dat, bt);
                lcs += bt - (bt = hud[0]);
                st.h = hu = hud[1];
            }
            else if (!hu)
                err(0);
            (s4 ? dhu4 : dhu)(dat.subarray(bt, bt += lcs), buf.subarray(spl), hu);
        }
        var ns = dat[bt++];
        if (ns) {
            if (ns == 255)
                ns = (dat[bt++] | (dat[bt++] << 8)) + 0x7F00;
            else if (ns > 127)
                ns = ((ns - 128) << 8) | dat[bt++];
            var scm = dat[bt++];
            if (scm & 3)
                err(0);
            var dts = [dmlt, doct, dllt];
            for (var i = 2; i > -1; --i) {
                var md = (scm >> ((i << 1) + 2)) & 3;
                if (md == 1) {
                    var rbuf = new u8([0, 0, dat[bt++]]);
                    dts[i] = {
                        s: rbuf.subarray(2, 3),
                        n: rbuf.subarray(0, 1),
                        t: new u16(rbuf.buffer, 0, 1),
                        b: 0
                    };
                }
                else if (md == 2) {
                    _a = rfse(dat, bt, 9 - (i & 1)), bt = _a[0], dts[i] = _a[1];
                }
                else if (md == 3) {
                    if (!st.t)
                        err(0);
                    dts[i] = st.t[i];
                }
            }
            var _b = st.t = dts, mlt = _b[0], oct = _b[1], llt = _b[2];
            var lb = dat[ebt - 1];
            if (!lb)
                err(0);
            var spos = (ebt << 3) - 8 + msb(lb) - llt.b, cbt = spos >> 3, oubt = 0;
            var lst = ((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << llt.b) - 1);
            cbt = (spos -= oct.b) >> 3;
            var ost = ((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << oct.b) - 1);
            cbt = (spos -= mlt.b) >> 3;
            var mst = ((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << mlt.b) - 1);
            for (++ns; --ns;) {
                var llc = llt.s[lst];
                var lbtr = llt.n[lst];
                var mlc = mlt.s[mst];
                var mbtr = mlt.n[mst];
                var ofc = oct.s[ost];
                var obtr = oct.n[ost];
                cbt = (spos -= ofc) >> 3;
                var ofp = 1 << ofc;
                var off = ofp + (((dat[cbt] | (dat[cbt + 1] << 8) | (dat[cbt + 2] << 16) | (dat[cbt + 3] << 24)) >>> (spos & 7)) & (ofp - 1));
                cbt = (spos -= mlb[mlc]) >> 3;
                var ml = mlbl[mlc] + (((dat[cbt] | (dat[cbt + 1] << 8) | (dat[cbt + 2] << 16)) >> (spos & 7)) & ((1 << mlb[mlc]) - 1));
                cbt = (spos -= llb[llc]) >> 3;
                var ll = llbl[llc] + (((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << llb[llc]) - 1));
                cbt = (spos -= lbtr) >> 3;
                lst = llt.t[lst] + (((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << lbtr) - 1));
                cbt = (spos -= mbtr) >> 3;
                mst = mlt.t[mst] + (((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << mbtr) - 1));
                cbt = (spos -= obtr) >> 3;
                ost = oct.t[ost] + (((dat[cbt] | (dat[cbt + 1] << 8)) >> (spos & 7)) & ((1 << obtr) - 1));
                if (off > 3) {
                    st.o[2] = st.o[1];
                    st.o[1] = st.o[0];
                    st.o[0] = off -= 3;
                }
                else {
                    var idx = off - (ll != 0);
                    if (idx) {
                        off = idx == 3 ? st.o[0] - 1 : st.o[idx];
                        if (idx > 1)
                            st.o[2] = st.o[1];
                        st.o[1] = st.o[0];
                        st.o[0] = off;
                    }
                    else
                        off = st.o[0];
                }
                for (var i = 0; i < ll; ++i) {
                    buf[oubt + i] = buf[spl + i];
                }
                oubt += ll, spl += ll;
                var stin = oubt - off;
                if (stin < 0) {
                    var len = -stin;
                    var bs = st.e + stin;
                    if (len > ml)
                        len = ml;
                    for (var i = 0; i < len; ++i) {
                        buf[oubt + i] = st.w[bs + i];
                    }
                    oubt += len, ml -= len, stin = 0;
                }
                for (var i = 0; i < ml; ++i) {
                    buf[oubt + i] = buf[stin + i];
                }
                oubt += ml;
            }
            if (oubt != spl) {
                while (spl < buf.length) {
                    buf[oubt++] = buf[spl++];
                }
            }
            else
                oubt = buf.length;
            if (out)
                st.y += oubt;
            else
                buf = slc(buf, 0, oubt);
        }
        else if (out) {
            st.y += lss;
            if (spl) {
                for (var i = 0; i < lss; ++i) {
                    buf[i] = buf[spl + i];
                }
            }
        }
        else if (spl)
            buf = slc(buf, spl);
        st.b = ebt;
        return buf;
    }
    err(2);
};
var cct = function (bufs, ol) {
    if (bufs.length == 1)
        return bufs[0];
    var buf = new u8(ol);
    for (var i = 0, b = 0; i < bufs.length; ++i) {
        var chk = bufs[i];
        buf.set(chk, b);
        b += chk.length;
    }
    return buf;
};
function decompress(dat, buf) {
    var bufs = [], nb = +!buf;
    var bt = 0, ol = 0;
    for (; dat.length;) {
        var st = rzfh(dat, nb || buf);
        if (typeof st == 'object') {
            if (nb) {
                buf = null;
                if (st.w.length == st.u) {
                    bufs.push(buf = st.w);
                    ol += st.u;
                }
            }
            else {
                bufs.push(buf);
                st.e = 0;
            }
            for (; !st.l;) {
                var blk = rzb(dat, st, buf);
                if (!blk)
                    err(5);
                if (buf)
                    st.e = st.y;
                else {
                    bufs.push(blk);
                    ol += blk.length;
                    cpw(st.w, 0, blk.length);
                    st.w.set(blk, st.w.length - blk.length);
                }
            }
            bt = st.b + (st.c * 4);
        }
        else
            bt = st;
        dat = dat.subarray(bt);
    }
    return cct(bufs, ol);
}
exports.decompress = decompress;

var Decompress = /*#__PURE__*/ (function () {
    function Decompress(ondata) {
        this.ondata = ondata;
        this.c = [];
        this.l = 0;
        this.z = 0;
    }
    Decompress.prototype.push = function (chunk, final) {
        if (typeof this.s == 'number') {
            var sub = Math.min(chunk.length, this.s);
            chunk = chunk.subarray(sub);
            this.s -= sub;
        }
        var sl = chunk.length;
        var ncs = sl + this.l;
        if (!this.s) {
            if (final) {
                if (!ncs) {
                    this.ondata(new u8(0), true);
                    return;
                }
                if (ncs < 5)
                    err(5);
            }
            else if (ncs < 18) {
                this.c.push(chunk);
                this.l = ncs;
                return;
            }
            if (this.l) {
                this.c.push(chunk);
                chunk = cct(this.c, ncs);
                this.c = [];
                this.l = 0;
            }
            if (typeof (this.s = rzfh(chunk)) == 'number')
                return this.push(chunk, final);
        }
        if (typeof this.s != 'number') {
            if (ncs < (this.z || 3)) {
                if (final)
                    err(5);
                this.c.push(chunk);
                this.l = ncs;
                return;
            }
            if (this.l) {
                this.c.push(chunk);
                chunk = cct(this.c, ncs);
                this.c = [];
                this.l = 0;
            }
            if (!this.z && ncs < (this.z = (chunk[this.s.b] & 2) ? 4 : 3 + ((chunk[this.s.b] >> 3) | (chunk[this.s.b + 1] << 5) | (chunk[this.s.b + 2] << 13)))) {
                if (final)
                    err(5);
                this.c.push(chunk);
                this.l = ncs;
                return;
            }
            else
                this.z = 0;
            for (;;) {
                var blk = rzb(chunk, this.s);
                if (!blk) {
                    if (final)
                        err(5);
                    var adc = chunk.subarray(this.s.b);
                    this.s.b = 0;
                    this.c.push(adc), this.l += adc.length;
                    return;
                }
                else {
                    this.ondata(blk, false);
                    cpw(this.s.w, 0, blk.length);
                    this.s.w.set(blk, this.s.w.length - blk.length);
                }
                if (this.s.l) {
                    var rest = chunk.subarray(this.s.b);
                    this.s = this.s.c * 4;
                    this.push(rest, final);
                    return;
                }
            }
        }
        else if (final)
            err(5);
    };
    return Decompress;
}());
exports.Decompress = Decompress;

  return exports;
}
