// ==UserScript==
// @name         Pico论坛替换title
// @namespace    Pico_title_replace
// @version      0.1
// @description  Pico论坛自动替换title，包含帖子详情、版块详情、个人主页
// @author       维克牛
// @match        https://bbs.picovr.com/*
// @icon         https://zstatic.picovr.com/pico/global/imgs/header/favicon.ico
// @grant        none


//脚本编写日期：2022年03月19日

// ==/UserScript==

(function() {
    'use strict';
    setInterval(function(){
        if (document.URL.includes("post/") )
        {
            var title ="帖子-"+ document.getElementsByClassName("index__titleText--zTSpT post-title-text")[0].innerHTML;
            document.title=title;
            //alert(title);
        }
        else if (document.URL.includes("category/"))
        {
           var cat="版块-"+document.getElementsByClassName("pico-typography pico-typography-simple-ellipsis index__title--71vLP")[0].innerHTML;
            document.title=cat;
        }

        else if (document.URL.includes("user/"))
        {
            var user ="个人-"+ document.getElementsByClassName("index__userName--R7Kz0")[0].innerHTML;
            document.title=user;
        }
        else {}

},1000);



})();
