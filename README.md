# Maninho Burguer — pronto para Vercel com PIX Fyntra

Este pacote já está preparado para subir na Vercel. O checkout chama `POST /api/pix`, que cria uma transação PIX na API da Fyntra.

## Publicar na Vercel

1. Descompacte a pasta.
2. Importe a pasta/repositório na Vercel.
3. Não precisa comando de build.
4. Em **Settings → Environment Variables**, cadastre:

```env
FYNTRA_API_KEY=6318f195-00cf-4647-8487-99fbc7042c33
```

> A chave também ficou como fallback no backend para facilitar o primeiro teste, mas o recomendado é usar a variável de ambiente da Vercel.

## Como funciona

- `index.html` envia o pedido para `/api/pix`.
- `api/pix.js` chama `https://api-gateway.fyntrabr.com/api/user/transactions`.
- A API retorna o PIX copia-e-cola e o QR Code aparece no checkout.

## Observação importante

A Fyntra exige CPF no endpoint. Como o checkout atual não coleta CPF, o backend envia um CPF técnico padrão (`DEFAULT_CUSTOMER_DOCUMENT`). Para produção com aprovação/antifraude melhor, adicione CPF no formulário e envie no request.
