# Maninho Burguer — Vercel + PIX Fyntra (com verificação automática)

## Publicar na Vercel

1. Descompacte a pasta.
2. Importe na Vercel (sem comando de build).
3. Em **Settings → Environment Variables**, cadastre:

```env
FYNTRA_API_KEY=6318f195-00cf-4647-8487-99fbc7042c33
PIX_WEBHOOK_URL=https://SEU-DOMINIO.vercel.app/api/webhook
```

## Rotas

| Rota | Função |
|------|--------|
| `POST /api/pix` | Cria a transação PIX na Fyntra e devolve QR Code + copia e cola |
| `GET /api/pix-status?id=...` | Consulta o status do pagamento (verificação automática) |
| `POST /api/webhook` | Recebe o postback da Fyntra quando o pagamento é confirmado |

## Verificação automática do pagamento

Depois que o QR Code aparece, o site consulta a Fyntra a cada 5 segundos (por até 20 minutos).

- Pagamento aprovado → tela de **"Pagamento confirmado!"** automática
- Pagamento recusado/expirado → aviso na tela
- Sem pagamento ainda → continua aguardando

Além do polling, existe o webhook `/api/webhook`. Cadastre essa URL no painel da Fyntra para receber a confirmação em tempo real. Os eventos aparecem em **Vercel → Deployments → Functions → Logs**.

Opcional: proteja o webhook criando a variável `PIX_WEBHOOK_SECRET` e enviando o header `x-webhook-secret`.

## Checkout

O formulário coleta nome, telefone, **CPF**, **e-mail** e endereço — dados exigidos pela Fyntra para aprovar a transação PIX.
