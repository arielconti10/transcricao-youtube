# Transcrição fácil — execução local

## Estado verificado

O site foi executado localmente em 23 de julho de 2026 e produziu uma
transcrição completa através da Gemini API.

- Vídeo: [Quando o Pai faz o café dos filhos](https://www.youtube.com/watch?v=H-nI5c1QKoY)
- Duração: 60 segundos
- Faixa de legendas do YouTube: não disponível
- Resultado: 141 palavras e 774 caracteres
- Resposta cortada: não
- Endpoint local: `200 OK`
- Erros no navegador: nenhum
- Verificação automatizada: 47 testes aprovados

O texto da transcrição e os valores secretos não foram guardados neste guia.

## Iniciar o site

No Terminal:

```sh
cd "/Users/arielconti/Documents/Codex/2026-07-17/my-mom-is-struggling-with-youtube"
npm start
```

Depois, abra no navegador:

```text
http://127.0.0.1:4173/
```

Introduza a palavra-passe definida em `SITE_PASSWORD` quando o ecrã de acesso
aparecer. Não coloque a palavra-passe nem a chave da Gemini no endereço.

Para parar o site, volte ao Terminal e prima `Control + C`.

## Fazer uma nova verificação real

```sh
npm run acceptance -- 'https://www.youtube.com/watch?v=ID_DO_VIDEO'
```

O comando não imprime a transcrição. Mostra apenas as contagens e falha se o
texto estiver vazio ou tiver sido cortado pelo limite de saída.

## Quando for alojar

Configure `GEMINI_API_KEY` e `SITE_PASSWORD` como variáveis secretas no
serviço de alojamento. Configure também `HOST=0.0.0.0`. Nunca envie nem publique
o ficheiro `.env`.
