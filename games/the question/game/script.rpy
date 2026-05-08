# ???????????????????????????????????????????????
# AUTO-GENERATED SCRIPT: The Question Remake
# AUTHOR: McMax
# ???????????????????????????????????????????????

## ?? Resolution Configuration
init python:
    config.screen_width  = 1280
    config.screen_height = 720

## ?? Auto-Discovered Variables ?????????
default book = False

## ?? Characters ?????????
define vnc_chSylv1 = Character('Sylvie', color='#c8ffc8')
define vnc_chMe001 = Character('Me', color='#c8c8ff')

## ?? Scenes ?????????????
label vns_scene_scStart:
    play music "audio/illurock.opus"
    scene expression Transform("images/bg lecturehall.jpg", fit="cover", xsize=config.screen_width, ysize=config.screen_height)
    with Fade(0.5, 0.0, 0.5)
    "It's only when I hear the sounds of shuffling feet and supplies being put away that I realize that the lecture's over."
    "Professor Eileen's lectures are usually interesting, but today I just couldn't concentrate on it."
    "I've had a lot of other thoughts on my mind...thoughts that culminate in a question."
    "It's a question that I've been meaning to ask a certain someone."
    scene expression Transform("images/bg uni.jpg", fit="cover", xsize=config.screen_width, ysize=config.screen_height)
    with Fade(0.5, 0.0, 0.5)
    "When we come out of the university, I spot her right away."
    show expression "images/sylvie green normal.png" at center
    with Dissolve(0.5)
    "I've known Sylvie since we were kids. She's got a big heart and she's always been a good friend to me."
    narrator "But recently... I've felt that I want something more."
    "More than just talking, more than just walking home together when our classes end."
    menu:
        "As soon as she catches my eye, I decide..."
        "To ask her right away.":
            jump vns_scene_scRway
        "To ask her later.":
            jump vns_scene_scLater
    return

label vns_scene_scRway:
    show expression "images/sylvie green smile.png" at center
    vnc_chSylv1 "Hi there! How was class?"
    vnc_chMe001 "Good..."
    "I can't bring myself to admit that it all went in one ear and out the other."
    vnc_chMe001 "Are you going home now? Wanna walk back with me?"
    show expression "images/sylvie green smile.png" at center
    vnc_chSylv1 "Sure!"
    scene expression Transform("images/bg meadow.jpg", fit="cover", xsize=config.screen_width, ysize=config.screen_height)
    with Fade(0.5, 0.0, 0.5)
    "After a short while, we reach the meadows just outside the neighborhood where we both live."
    "It's a scenic view I've grown used to. Autumn is especially beautiful here."
    "When we were children, we played in these meadows a lot, so they're full of memories."
    vnc_chMe001 "Hey... Umm..."
    show expression "images/sylvie green smile.png" at center
    with Dissolve(0.5)
    "She turns to me and smiles. She looks so welcoming that I feel my nervousness melt away."
    "I'll ask her...!"
    vnc_chMe001 "Ummm... Will you..."
    vnc_chMe001 "Will you be my artist for a visual novel?"
    show expression "images/sylvie green surprised.png" at center
    "Silence."
    "She looks so shocked that I begin to fear the worst. But then..."
    show expression "images/sylvie green smile.png" at center
    menu:
        "Sure, but what's a \"visual novel\"?"
        "It's a videogame.":
            jump vns_scene_scGame
        "It's an interactive book.":
            jump vns_scene_scBook
    return

label vns_scene_scGame:
    vnc_chMe001 "It's a kind of videogame you can play on your computer or a console."
    vnc_chMe001 "Visual novels tell a story with pictures and music."
    vnc_chMe001 "Sometimes, you also get to make choices that affect the outcome of the story."
    show expression "images/sylvie green smile.png" at center
    vnc_chSylv1 "So it's like those choose-your-adventure books?"
    vnc_chMe001 "Exactly! I've got lots of different ideas that I think would work."
    vnc_chMe001 "And I thought maybe you could help me...since I know how you like to draw."
    vnc_chMe001 "It'd be hard for me to make a visual novel alone."
    show expression "images/sylvie green normal.png" at center
    show expression "images/sylvie green normal.png" at center
    vnc_chSylv1 "Well, sure! I can try. I just hope I don't disappoint you."
    vnc_chMe001 "You know you could never disappoint me, Sylvie."
    with dissolve
    jump vns_scene_scMarry
    return

label vns_scene_scBook:
    $ book = True
    vnc_chMe001 "It's like an interactive book that you can read on a computer or a console."
    show expression "images/sylvie green surprised.png" at center
    show expression "images/sylvie green surprised.png" at center
    vnc_chSylv1 "Interactive?"
    vnc_chMe001 "You can make choices that lead to different events and endings in the story."
    show expression "images/sylvie green surprised.png" at center
    vnc_chSylv1 "So where does the \"visual\" part come in?"
    vnc_chMe001 "Visual novels have pictures and even music, sound effects, and sometimes voice acting to go along with the text."
    show expression "images/sylvie green smile.png" at center
    show expression "images/sylvie green smile.png" at center
    vnc_chSylv1 "I see! That certainly sounds like fun. I actually used to make webcomics way back when, so I've got lots of story ideas."
    vnc_chMe001 "That's great! So...would you be interested in working with me as an artist?"
    show expression "images/sylvie green smile.png" at center
    vnc_chSylv1 "I'd love to!"
    with dissolve
    jump vns_scene_scMarry
    return

label vns_scene_scMarry:
    scene expression Transform("images/bg club.jpg", fit="cover", xsize=config.screen_width, ysize=config.screen_height)
    with Dissolve(0.5)
    "And so, we become a visual novel creating duo."
    with Dissolve(0.5)
    "Over the years, we make lots of games and have a lot of fun making them."
    "We take turns coming up with stories and characters and support each other to make some great games!"
    "And one day..."
    show expression "images/sylvie blue normal.png" at center
    with Dissolve(0.5)
    show expression "images/sylvie blue normal.png" at center
    vnc_chSylv1 "Hey..."
    vnc_chMe001 "Yes?"
    show expression "images/sylvie blue giggle.png" at center
    show expression "images/sylvie blue giggle.png" at center
    vnc_chSylv1 "Will you marry me?"
    vnc_chMe001 "What? Where did this come from?"
    show expression "images/sylvie blue surprised.png" at center
    show expression "images/sylvie blue surprised.png" at center
    vnc_chSylv1 "Come on, how long have we been dating?"
    vnc_chMe001 "A while..."
    show expression "images/sylvie blue normal.png" at center
    show expression "images/sylvie blue normal.png" at center
    vnc_chSylv1 "These last few years we've been making visual novels together, spending time together, helping each other..."
    show expression "images/sylvie blue normal.png" at center
    vnc_chSylv1 "I've gotten to know you and care about you better than anyone else. And I think the same goes for you, right?"
    vnc_chMe001 "Sylvie..."
    show expression "images/sylvie blue giggle.png" at center
    show expression "images/sylvie blue giggle.png" at center
    vnc_chSylv1 "But I know you're the indecisive type. If I held back, who knows when you'd propose?"
    show expression "images/sylvie blue normal.png" at center
    show expression "images/sylvie blue normal.png" at center
    vnc_chSylv1 "So will you marry me?"
    vnc_chMe001 "Of course I will! I've actually been meaning to propose, honest!"
    show expression "images/sylvie blue normal.png" at center
    vnc_chSylv1 "I know, I know."
    vnc_chMe001 "I guess... I was too worried about timing. I wanted to ask the right question at the right time."
    show expression "images/sylvie blue giggle.png" at center
    show expression "images/sylvie blue giggle.png" at center
    vnc_chSylv1 "You worry too much. If only this were a visual novel and I could pick an option to give you more courage!"
    with Dissolve(0.5)
    "We get married shortly after that."
    "Our visual novel duo lives on even after we're married...and I try my best to be more decisive."
    "Together, we live happily ever after even now."
    "{b}Good Ending{/b}."
    return

label vns_scene_scLater:
    "I can't get up the nerve to ask right now. With a gulp, I decide to ask her later."
    with Dissolve(0.5)
    "But I'm an indecisive person."
    "I couldn't ask her that day and I end up never being able to ask her."
    "I guess I'll never know the answer to my question now..."
    "{b}Bad Ending{/b}."
    return

## Entry Point
label start:
    jump vns_scene_scStart
