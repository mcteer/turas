import { eveChannel } from "eve/channels/eve";
     import {
       httpBasic,
       localDev,
       vercelOidc,
     } from "eve/channels/auth";

     const username = process.env.TURAS_DEMO_USERNAME;
     const password = process.env.TURAS_DEMO_PASSWORD;

     export default eveChannel({
       auth: [
         ...(username && password
           ? [
               httpBasic(
                 { username, password },
                 { realm: "Turas" },
               ),
             ]
           : []),
         vercelOidc(),
         localDev(),
       ],
     });
