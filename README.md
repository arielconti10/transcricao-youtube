# Transcrição fácil

Um site móvel simples, em português, que transforma a fala de um vídeo público
do YouTube numa transcrição limpa. Funciona mesmo quando o vídeo não tem
legendas, não exige conta e não guarda o link nem a transcrição.

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
   FAMILY_ACCESS_TOKEN=um-segredo-longo-e-aleatorio
   ```

   Pode gerar o segredo familiar com:

   ```sh
   openssl rand -hex 24
   ```

4. Inicie o site:

   ```sh
   npm start
   ```

5. Abra este endereço, substituindo o texto depois de `#` pelo segredo familiar:

   ```text
   http://127.0.0.1:4173/#um-segredo-longo-e-aleatorio
   ```

O segredo fica no fragmento do endereço (`#...`), que o navegador não envia ao
servidor. O site manda-o apenas no cabeçalho protegido do pedido de transcrição.
Nunca publique o ficheiro `.env` nem coloque a chave da Gemini no código do site.

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

A Gemini só consegue analisar vídeos públicos do YouTube. Vídeos privados ou
indisponíveis devolvem uma mensagem simples no site.

## Preparar para alojamento

No serviço de alojamento, configure `GEMINI_API_KEY` e `FAMILY_ACCESS_TOKEN` como
variáveis secretas. Defina também `HOST=0.0.0.0`; a plataforma normalmente
fornece `PORT`. Se o serviço estiver atrás de um proxy de confiança, pode definir
`TRUST_PROXY=true` para aplicar o limite horário ao endereço real do visitante.
