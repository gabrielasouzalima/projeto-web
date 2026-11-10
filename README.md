# Kanban Board para GitHub Pages

Este é um site estático: usa somente HTML, CSS e JavaScript do navegador. Não há servidor nem API externa. Cadastro e login são demonstrativos e funcionam somente neste navegador.

## Dados e privacidade

As contas, a sessão, o quadro e a preferência de tema ficam no `localStorage` deste navegador. A senha é derivada com PBKDF2 via Web Crypto; ainda assim, este login **não oferece segurança real**: o código e o armazenamento estão no dispositivo do usuário e podem ser alterados ou inspecionados. Não use senhas reais nem guarde informações sensíveis. Os dados não sincronizam entre navegadores ou dispositivos. Use exportação JSON para fazer uma cópia ou transportar um quadro.

O navegador precisa oferecer Web Crypto em contexto seguro: GitHub Pages usa HTTPS; no desenvolvimento local, use `localhost` ou a extensão Live Server.

## Publicar no GitHub Pages

1. Envie `index.html`, `style.css`, `script.js` e `favicon.svg` para a raiz da branch `main` do seu repositório.
2. No GitHub, abra o repositório em **Settings > Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**, escolha `main` e a pasta **/(root)** e salve.
4. Aguarde a publicação e abra o endereço Pages indicado pelo GitHub.

Os caminhos dos arquivos são relativos, então o projeto funciona também quando o Pages publica em `/nome-do-repositorio/`.

## Testar localmente

Abra `index.html` no navegador ou use a extensão **Live Server** do VS Code. O quadro não depende de conexão à internet.
