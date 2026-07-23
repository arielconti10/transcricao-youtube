# Transcrição fácil

Um site móvel simples, em português, que transforma a fala de um vídeo
público ou não listado do YouTube numa transcrição limpa. Funciona mesmo
quando o vídeo não tem legendas, não exige conta e não guarda o link nem a
transcrição.

## O que é necessário

- Node.js 24 ou mais recente
- Uma chave da Gemini API criada no [Google AI Studio](https://aistudio.google.com/apikey)

## Executar localmente

1. Instale as dependências:

   ```sh
   npm install
   ```

2. Crie o ficheiro de configuração:

   ```sh
   cp .env.example .env
   ```

3. Abra `.env` e preencha os dois valores:

   ```dotenv
   GEMINI_API_KEY=sua-chave-da-gemini
   SITE_PASSWORD=uma-palavra-passe-longa
   ```

   Pode gerar uma palavra-passe aleatória com:

   ```sh
   openssl rand -hex 24
   ```

4. Inicie o site:

   ```sh
   npm start
   ```

5. Abra o endereço normal:

   ```text
   http://127.0.0.1:4173/
   ```

Na primeira visita, o site pede `SITE_PASSWORD`. Depois de a palavra-passe ser
aceite, o servidor cria uma sessão protegida num cookie `HttpOnly`; a
palavra-passe não aparece no endereço e não fica guardada no armazenamento do
navegador. O mesmo telemóvel entra automaticamente nas visitas seguintes. Nunca
publique o ficheiro `.env` nem coloque a chave da Gemini ou a palavra-passe no
código do site.

## Verificar o projeto

```sh
npm run check
```

Este comando executa os testes, verifica os tipos e valida o JavaScript enviado
ao navegador.

## Confirmar uma transcrição real

Com o `.env` preenchido, execute o teste de aceitação com um vídeo público:

```sh
npm run acceptance -- https://www.youtube.com/watch?v=ID_DO_VIDEO
```

O comando inicia o endpoint local numa porta temporária e envia o vídeo através
do mesmo caminho usado pelo site. Por privacidade, mostra apenas as contagens de
palavras e caracteres. Termina com erro se a resposta estiver vazia ou se a
Gemini tiver cortado a transcrição por atingir o limite de saída.

## Limites e proteção de custos

Por predefinição, o servidor aceita uma transcrição de cada vez, seis pedidos
por hora por visitante e vinte pedidos por dia no total. Estes valores podem ser
alterados no `.env`; todas as opções estão documentadas em `.env.example`.

Vídeos públicos são enviados à Gemini pelo próprio link. Para vídeos não
listados, o servidor descarrega apenas a faixa de áudio, envia-a à Gemini como
um ficheiro temporário e apaga esse ficheiro logo a seguir — o áudio não fica
guardado. O tamanho máximo dessa faixa de áudio pode ser ajustado com
`MAX_AUDIO_BYTES` no `.env`. Vídeos privados ou indisponíveis devolvem uma
mensagem simples no site.

## Publicar no Cloudflare Workers

O projeto inclui `wrangler.jsonc` e uma entrada própria para Cloudflare Workers.
Os ficheiros de `public/` são servidos como Static Assets e a chamada à Gemini
continua a acontecer apenas no servidor.

1. Instale e autentique o Wrangler:

   ```sh
   npm install -D wrangler@latest
   npx wrangler login
   ```

2. Publique o Worker e envie os dois valores de `.env` como segredos:

   ```sh
   npx wrangler deploy --secrets-file .env
   ```

3. Abra o endereço normal devolvido pelo Wrangler. Na primeira visita de cada
   telemóvel, introduza `SITE_PASSWORD`; nas visitas seguintes, a sessão é
   reconhecida automaticamente.

Nunca coloque `GEMINI_API_KEY` ou `SITE_PASSWORD` em `wrangler.jsonc`.
