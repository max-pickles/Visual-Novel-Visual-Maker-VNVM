# The script of the game goes in this file.

# Declare characters used by this game. The color argument colorizes the
# name of the character.

define t = Character("takagi-san")
define h = Character("Hank Hill")
define k = Character("Mr. Krabs")
define m = Character("Masquerade Mike")
define m2 = Character("Mike")
define v = Character("Void")
define b = Character("Bloodstain McSwordman")
define p = Character("Peter Pjotr")
define mb = Character("Moneybags")
define l = Character("Matthew Lesko")
define sl = Character("Super Lesko")
define o = Character("Old Man")
define u = Character("Ultimate Heartless")

image moneybags spooky:
    yalign 0.5
    "moneybags first"
    pause .2
    "moneybags neutral"
    pause .2
    yalign 0.0
    "moneybags third"
    pause .2
    "moneybags fourth"
    pause .2
    "moneybags fifth"
    pause .2
    
transform position1:
   align(0.4, 0.6)
   
transform position2:
   align(0.4,0.4)

transform leftish:
   xalign 0.3 yalign 1.0
   
transform rightish:
   xalign 0.7 yalign 1.0
   
transform center:
   xalign 0.5
   yalign 0.5
   
transform low:
   xalign 0.5
   yalign 0.0
   
   
# The game starts here.

label start:

   $ takagi_flag = False
   
   $ krabs_flag = False
   
   $ void_flag = False
   
   $ hank_flag = False

   scene bg room

   show mario point

   "One day, Mario woke up."
   
   play music "yugioh.ogg" fadeout 1

   scene bg roomdark

   show mario point

   "In this story, you take the role of Mario as he participates in an adventure beyond his understanding."

   "You choices will help lead Mario to triumph, or to ruin."

   "Can you accept this responsibility?"

   menu:

       "I can.":
            jump intro_good

       "I can not.":
            jump intro_bad

label intro_bad:

   "Very well. Your adventure has ended before it began. Go on, in blissful ignorance of what lays in wait, just around the corner..."

return

label intro_good:

   "Excellent. With your permission, the story may begin, in earnest."

   scene bg room
   
   play music "recet1.ogg" fadeout 1

   "You wipe the sleep from your eyes as you sit up in bed. At first, you're startled by the unfamiliar surroundings. Last night you were up late, and the lack of sleep has left you with a pounding headache."
   
   "You briefly consider spending a few more minutes in bed, when a voice calls out to you."

   "???" "You awake in there? Better get ready soon, it's already quarter to 7!"

   "You quickly change into your regular clothes and open the door to your room. In the hall, the sounds and smells of sizzling bacon overwhelm your senses, and you head over to the kitchen."

   scene bg kitchen

   show hank friendly

   h "There you are! I whipped us up some bacon and eggs. You know what they say, breakfast is the most important meal of the day!"

   "Hank hands you a plate as you take a seat next to him. In the center of the table sits a large serving tray, piled high with stacks of smoked bacon and eggs over easy. You take a modest amount for yourself, as Hank continues making conversation."

   h "I tell you hwat, I haven't cooked this much in months! Usually it's just me and a bowl of canned soup. Now that I'm lookin' after a teenage boy, I'll have to keep the fridges stocked!"

   h "When I heard you were moving to Smalltown, Japan, I dang near spilled my beer. Of course I'd do anything for a son of Peggy's friend, but hwat a coincidence."

   h "I figured, coming out here for work, I wouldn't have any sort of company. Not that I mind! It'll be good having a buddy around, and we're only ten minutes away from your new school!"

   h "Speakin' of, I suspect the bus should be here any minute now. You'd better hurry on out, y'need to visit the counselor before class!"

   "You take one last heaping mouthful of eggs as you stand up from the table, and make your way outside to the bus stop."

label bus_stop:

   scene bg house

   "The bus doesn't seem to be coming. You begin to wonder if Hank read the schedule wrong..."
   
   play music "happy.ogg" fadeout 1
   
   "???" "ayy lol who the heck is this dude"
   
   "You hear a young girl talking behind you."
   
   show takagi smug
   
   "???" "lmao u new here bud? never seen anyone wearing denim suspenders in the summer b4"
   
   "You introduce yourself, and explain that you're living with Hank for the rest of high school."
   
   t "cool, cool... you can call me takagi-san. dude we're like... neighbours 2 or something lol"
   
   t "ayy new neighbour what's ur favorite color"
   
   menu:
   
         "Crimson.":
            jump bus_chat
       
         "Maroon.":
           jump bus_chat
          
         "Ruby.":
           jump bus_chat
          
         "Copper.":
           jump bus_chat
          
         "Red.":
           jump bus_chat
          
label bus_chat:
          
   t "rly? you seem more like a green kinda guy to me"
   
   t "personally i'm a fan of clear. nothing out there quite like it tbh."
   
   "In the distance, you see the city bus coming over the hill a few blocks away."
   
   t "peacing out? ay no prob, i got class in a bit too. later bud"
   
   "You say your goodbyes to Takagi and board the city bus."
   
   stop music
   
label school_start:

   scene bg school
   
   "You arrive at the Smalltown Academy for Fragile Youth, your new high school. Remembering Hank's words, you quickly go inside and begin searching for the counselor's office."
   
   scene bg office
   
   show krabs neutral
   
   play music "spinball.ogg" fadeout 1
   
   "???" "All the other shawties, they be callin' me wack, but I... something something... back..."
   
   "He appears to be singing to himself..."

   "???" "Ack, boy, don't break me concentration!"
   
   "You ask if you can speak to the school counselor."
    
   k "You're looking at him, lad! Eugene Krabs, world's greatest school counselor!"
    
   show krabs greedy
    
   k "But I'm not long for this career, oh no. Once I get discovered, I'll be living the high life. Cars, chicks, and loads of money!"
    
   k "You'll add me on Soundcloud, right boy? Just type Krabs Soundcloud into Bing, I'm the fifth or sixth result."
    
   menu:
   
      "Sure, but I need to talk to you first.":
         jump krabs_good
       
      "Does Soundcloud still exist?":
         jump krabs_bad
           
           
label krabs_bad:

    k "Of course it does!"
    
    k "Er, I think so. I haven't used it meself in a few months..."
    
    jump krabs_chat
           
label krabs_good:

    $ krabs_flag = True

    k "Of course, me boy! Anything for a fan!"
    
    k "Oh, and make sure to upvote me on the Twitter. It helps with search engine alternization."
    
label krabs_chat:
    
    "You explain that you're a transfer student, and you don't know where your classes are."
    
    scene cg krabs
    
    k "Oh, a new student are ya? I'm sure it's so tough with your grade point averages and your mathematics."
    
    scene cg alexa
    
    play music "despacito.ogg" fadeout 1
    
    k "Boo-hoo, let me play you Despacito on the world's smallest Alexa."
    
    k "It really is the world's smallest Alexa. See?"
    
    scene bg office
    
    show krabs neutral at left
    
    show bloodstain neutral at right
    
    "???" "Hey, Krabs-sensei. My locker isn't tall enough to fit a katana, so I was wondering if there were any teachers' lockers free."
    
    "???" "Are you listening to Despacito?"
    
    k "Aye boy, the new kid was getting all worked up, so I played some soothing tunes for him. Would've played my own music, but I can't figure out how to get it into this thing."
    
    play music "forces.ogg" fadeout 1
    
    "While Mr. Krabs fiddles with his Alexa, you introduce yourself to the student."
    
    b "My name is Bloodstain McSwordman. You can say my name without an honorific. Please take care of me, Mario."
    
    k "Good, good, everyone's making friends. Why don't you two run along, I have very important counselor duties to take care of."
    
    b "Sure. My class was supposed to get a transfer student today, so I guess you're it. Our classroom is just down the hall."
    
    scene bg class
    
    "Bloodstain escorts you to your first class. The only seat left is directly under the air conditioner, and cold air blasts in your face for the rest of class."
    
    show pjotr happy
    
    play music "ayaya.ogg"
    
    p "Hello class. Today we have new student to introduce. I am Peter Pjotr, teacher to you. Please make introduction."
    
    "You stand and introduce yourself to the class."
    
    p "Very good introducing, Mario. You can find weapon at back of class. Please obtain gun for marksmanship practice."
    
    hide pjotr
    
    show bloodstain neutral
    
    b "Since most of the students here have weak constitutions and frail bodies, we're given full military combat training for self-defence."
    
    show bloodstain katana
    
    b "Of course, with my trusty Battleborn at my side, guns would only hold me back."
    
    menu:

        "Cool samurai sword.":
            jump bloodstain_talk

        "Why is it called Battleborn?":
            jump bloodstain_talk
            
label bloodstain_talk:

    b "It's a family heirloom. My father gave it to me when I came of age. I should be honing my skills on the peaks of Fuji-san right now, but I'm stuck here."
    
    show swimsuit saber at right
    
    b "See, I have a bit of a condition. If I don't pull a 5-star Servant every month, my heart will stop."
    
    show bloodstain neutral
    
    b "Normally this would be no problem, as I've amassed quite the money hoard from my numerous successful contracts as a bounty hunter."
    
    b "But I've run a bit low on funds recently, so I've been sent here to avoid over-exerting myself, in case my health detoriates further."
    
    b "It's been a few weeks already..."
    
    "You place a friendly hand on Bloodstain's shoulder, and tell him that you can empathize with his condition."
    
    b "You're allergic to pan-seared trout, eh? That's a rough one. The way I see it, we're in this together now."
    
    b "Now, if you'll excuse me, the new Rin dropped today, and I've been saving up."
    
    hide bloodstain
    
    hide swimsuit
    
    show pjotr happy
    
    p "Mario, it is your turn for the shooting of target. Please come to practice now."
    
    "You continue with firearms training for the rest of the day."
    
    "Your proficiency leveled up!"
    
    scene bg house
    
    play music "recet1.ogg" fadeout 1

    "After an uneventful bus ride, you return home."
    
    "You try to open the front door, but it's locked, and Hank never gave you a key."
    
    menu:
         "Look for Hank behind the house.":
            jump house_locked

         "Look for Hank down the street.":
            jump house_locked
        
label house_locked:

    "You look for Hank, but he's nowhere in sight. Dejected, you take a seat at the bus stop and wait for him to get home."
    
    t "lmao what the heck r u doin man. u just got here now ur already peacin out?"
    
    show takagi smug
    
    play music "happy.ogg" fadeout 1
    
    "You turn around, and see Takagi calling to you from her front door. When you make eye contact, she walks out to the bus stop next to you."
    
    t "i was just catching the end of jeopardy and i saw u wandering the streets. did you lose ur house or something lol"
    
    t "seriously dude it's right behind us. i hear he's got like, a couch and some chairs. u don't need to sit on a bench"
    
    "You explain that you're locked out."
    
    t "lmao for real? hold on man, he keeps a spare key in the mailbox"
    
    t "pretty good hiding place tbh. no one ever gets mail anymore. really makes you think."
    
    "Takagi unlocks the front door, and heads straight inside. Confused, you follow her in."
    

label takagi_chat:

    scene bg room

    show takagi smug

    t "ayyo lmao this is your room huh"

    t "nice pic of power lines man that's my aesthetic"

    menu:

        "Yeah, thanks. Me too.":
            jump takagi_good

        "Uh, that picture came with the frame.":
            jump takagi_bad

    label takagi_good:

        $ takagi_flag = True

        show takagi ok

        t "lol man ur alright"

        t "we should chill again sometime, maybe play some cod blops lmao"

        t "don't tell my mom tho i'm like 6 years old and she doesn't want me playing violent games"

        t "like ok MARTHA i guess i'll just have people over to play sonic schoolhouse kek"

        hide takagi

        "You think Takagi is a bit strange, but you enjoyed talking to her. Maybe you'll spend time with her again later."

        jump takagi_end

    label takagi_bad:

        t "ok man that's some false advertising"

        t "f this s i'm going home. i'm missing wheel of fortune anyway"

        hide takagi

        "You think Takagi is a bit strange. Maybe you shouldn't talk to her anymore..."

        jump takagi_end
        
    label takagi_end:
        
        "brrrrrring brrrrrrrrrrrrrring"
           
        "Your phone is ringing."
        
        show cellphone at left
        
        play music "mmsf.ogg" fadeout 1

        h "It's me, Hank. There's a real gosh darn situation over at the wrestling ring. How soon can you be here?"
        
        "You walk Takagi home, and take the next bus downtown to meet with Hank."
        
    scene bg ringside
    

    
    "Announcer" "What an amaaaaazing match ladies and gentlemen! Our superstars fought valiantly, but in the end there can only be one winner!"
    
    "It looks like you arrived just as the match was ending."
    
    show hank friendly
    
    h "Mario, I finally found you. Listen, this is no good wholesome wrestling ring."
    
    show hank determined
    
    h "They've been bought out by some dang suit, and monsters called Heartless have been taking down wrestlers left and right. It's not right, I tell you hwat."
    
    h "Things are about to get frisky, so I need you to pull a fire alarm and make the audience skedaddle while I handle things in the ring."
    
    "Announcer" "Aaaaaaaaallright folks, I think you know what time it is! Put your hands together for the maaaaaaaaain eeeeeeeevent!"
    
    h "We're outta time, buddy. You need to make tracks, and fast."
    
    "Hank points his Keyblade at you, and a warm light surrounds you."
    
    "You now have protection from darkness!"
    
    h "Gat'dang Heartless!"
    
    scene bg ring
    
    show hank determined at left
    
    show heartless basic at right
    
    "Hank jumps into the ring as the spotlights come on. A strange monster is in the middle of the ring, darkness swirling at its feet. The crowd erupts into deafening applause."
    
    "Announcer" "That's right folks, it's the star of the show: the Heartless!"
    
    "Announcer" "And tonight, live on stage, he's going to take your hearts!"
    
    "The darkness swirling around the Heartless expands, surrounding the audience. Their applause slowly goes quiet, and around you, people begin to collapse one by one."
    
    h "I'm gonna pound you like a cheap skirt steak!"
    
    "Hank jumps forward, taking a wild leaping swing at the Heartless. At the last second, it moves just a few inches to the side, completely out of harm's way."
    
    h "Slow down y'dang mongrel!"
    
    "It looks like Hank is having trouble."
    
label battle_choice:
     menu:

        "Help Hank.":
            jump battle_win
            
        "Let him do it alone.":
            jump battle_loop
            
label battle_loop:
    "He needs your help!"
    
    jump battle_choice
    
label battle_win:
    "You pull your assault rifle from your backpack and fire at the Heartless. It evades your attack, but moves right into Hank's range. With one mighty swing, he smashes the Heartless into dust."
    
    scene bg ring
    
    show hank friendly
    
    play music "recet2.ogg" fadeout 1
    
    h "Phew, that was a close one. Looks like we finished it before anyone got hurt."
    
    h "Listen Mario, that wasn't the first Heartless, and it sure as heck won't be the last."
    
    h "I didn't want to involve you in this, but it looks like I have no choice. If I fall in battle, you gotta take my Keyblade and protect the world from them dang Heartless."
    
    "You're shocked by Hank's words. All you can manage is a quick nod."
    
    h "Thank you, Mario. You should get home, while I check on the civilians."
    
    scene bg alley
    
    play music "etrian.ogg" fadeout 1
    
    "You leave the wrestling ring. It's gotten late, and many of the busses have stopped running. You'll have to walk most of the way home."
    
    "There's no one on the street, which you think is strange. You'd expect to see a lot of people, even at night, in this part of town."
    
    "Feeling scared, you keep looking down at the ground while walking home."
    
    scene bg shadow
    
    "Suddenly, a shadow stretching towards you catches your eye-- but there isn't anyone around you."

    "You look up to see who's there,"
    
    scene bg alley
    
    
    show moneybags small at position1
    
    "and see a man walking in front of you. But he looks a little strange."
    
    "Since he's walking very slow, you soon catch up with him."
    
    show moneybags medium at position2
    
    "He seems to be wearing a business suit, and featureless black shoes."
    
    "Worse, he's not wearing any pants, and looks like he only has one giant finger and a thumb on each hand."
    
    "It seems so weird that you stop walking."
    
    "You don't feel like you should get any closer to him, and you don't have the guts to pass him by."
    
    hide moneybags
    
    window hide
    
    show moneybags spooky
    
    pause(2.0)
    
    scene bg alley
    
    show moneybags neutral
    
    mb "Mario, I didn't know you were in town! I'm glad I ran into you. We have very important matters to discuss."
    
    mb "As you know, I'm an incredibly wealthy, successful business owner. I've come to Smalltown seeking new opportunities."
    
    mb "And you, old friend, are just the man I need to seize those opportunities. This is a very exciting, once in a lifetime offer."
    
    mb "All you need to do is provide me some initial capital. Say, one million gems should do it."
    
    mb "I'll handle the rest, and in a few months, your investment will pay out tenfold! So, my dearest compatriot, what do you say?"
    
    menu:

        "I'm not sure...":
            jump moneybags_bad

        "Seems like a lot of money.":
            jump moneybags_bad 
            
        "I don't think that's a real currency.":
            jump moneybags_bad 
            
        "What happened to selling boss keys?":
            jump moneybags_bad 
            
label moneybags_bad:

    mb "Well, well, well..."
    
    mb "You could've been rich beyond your wildest dreams! But if you can't provide the funding, I'll find it somewhere else."
    
    mb "This was your last chance, Mario. You should've invested while you still could."
    
    hide moneybags
    
    "Moneybags leaves, disappearing into the night. You decide to jog the rest of the way home."
    
label day_two:
    
    scene bg room

    play music "recet1.ogg" fadeout 1
    
    "You enjoy a deep sleep after your eventful first day of school."
    
    h "Hey, are ya decent? I need to talk to ya."
    
    "You crawl out of bed, and unlock your door to speak with Hank."
    
    show hank determined
    
    h "Look, I didn't want you to know about all this hullaballooh, but it's a little late for that now."
    
    h "I just wanted to let you know that I'll be out fighting those dang Heartless again today. If I don't come home, well... you get the idea."
    
    "You nod in solemn understanding."
    
    show hank friendly
    
    h "But enough doom and gloom. I believe it's your second day of school, so get out there, buddy!"

    scene bg house
    
    pause 2
    
    scene bg school

    pause 2

    scene bg class

    show pjotr happy
    
    play music "ayaya.ogg" fadeout 1

    p "Good morning to class. Today is different day because we will not perform lecture."

    p "Students will take trip to local amusement park. We are conducting team building exercise to make life-long connections."

    hide pjotr

    show bloodstain neutral

    b "Pssh, how ridiculous. There's no merit in childish flights of fancy."

    b "Shame on our sensei for wasting our valuable tuition dollars on something so meaningless."

    show swimsuit saber at right

    b "I had better make the most of our brief time on campus, lest I discover this theme park has no wi-fi access."

    "You, and the rest of the class, leave the school for the field trip."

    scene bg leskoland
   
    show lesko normal
   
    play music "metrocross.ogg" fadeout 1
   
    l "Heya folks, I'm Matthew Lesko, and I'm here to proudly present the grand opening of my new theme park, Lesko Land!"
   
    l "It's been my dream since I was just a little Lesko to open up an amusement park, and today, with the help of numerous government grants, that dream is finally coming true."
   
    l "So step on in, and let Lesko Land give you the freedom to do whatever your heart desires."
   
    hide lesko
   
    show pjotr happy
   
    p "Please students, I must request that you do not do whatever your hearts desires. We are representing school and must follow strict behavioral conduct."
   
    hide pjotr
   
    show bloodstain neutral
   
    b "So... it's just a bunch of pipes?"
   
    show bloodstain neutral at left
   
    show old man at right
   
    o "Mostly, yes, but there are also valves and grates."
   
    o "Now students, if you'd like a tour of the facility, please follow me. Our first stop is the Emulsion Station."
   
    b "Only a true baka would be interested in such foolishness. Come on Mario, let's check if they left the password on the router."
   
    "You decide to follow Bloodstain while the rest of the class tours Lesko Land."
   
    hide old man
   
    b "What a joke. I can hardly fathom how our presitigous academy was swindled by that four-eyed conman."
   
    "???" "Wonderful, wonderful. The plan is proceeding just as scheduled."
   
    b "Hold on, I think I hear someone coming."
   
    b "Strange, everyone should be on the tour. Who else is here with us?"
   
    show moneybags neutral at right
   
    mb "Mario? What are you doing here? If you've come to renegotiate, I'm afraid I've already secured the necessary funds elsewhere."
   
    show bloodstain katana
   
    b "Kisama......... You'll pay for crossing the Pitchford clan, Moneybags!"
   
    "Bloodstain raises his katana at Moneybags. You step in front of him, demanding he explain himself."
   
    b "Mario, this demon stole my family's money hoard and used it to buy a wrestling ring downtown! He's the reason I came to this town in the first place."
   
    b "Greedy, narcissistic monsters like him need to be stricken down!"
   
    mb "Your money hoard? Ah, so you're the son of Pitchford. You know, the Megalomaniacs For the Greater Good could use an assassin of your talent."
   
    mb "What do you say, boy? Join me, and together we'll rule Japan."
   
    b "I'll never join you!"
   
    h "Now what in the gat'dang heck is going on here?"
   
    show hank determined
   
    h "Mario? You're supposed to be in school!"
    
    mb "A keyblade? You must be the one who's been destroying my Heartless!"
    
    h "Your Heartless? What kinda yellow-bellied fiend would summon creatures of darkness to this sweet town?"
    
    b "Only a demon with a heart blacker than the deepest darkness."
    
    h "Well son, I'm still not sure what in the sam-hill is going on here, but my pop always told me: the enemy of my enemy is my friend."
    
    b "Hai. I would be honored to fight alongside a keyblade wielder."
    
    mb "I won't be taken down that easily! Bring out Lesko!"
    
    h "Lesko?!"
    
    show old man at rightish
    
    show hank determined at leftish
    
    show lesko normal
    
    o "As you command, Moneybags."
    
    "The old man from earlier runs to the scene, with Matthew Lesko close behind. Lesko seems distant, as if in a trance."
    
    o "Show them your true power, Lesko!"
    
    show chaos emeralds
    
    "The old man pulls a set of gems from his pockets. The gems float towards Lesko, as if drawn to him."
    
    h "The chaos emeralds?! Gat'dangit!"
    
    hide chaos emeralds
    
    show lesko super
    
    play music "metro2.ogg" fadeout 1
    
    sl "HYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    
    mb "I'm sorry Mario, but I believe this will be our last meeting. I did treasure our friendship, once, but I've moved on to bigger and better things. Farewell."
    
    hide moneybags
    
    "Moneybags flees the scene. Bloodstain attacks, but Super Lesko blocks his katana with one hand. He then tosses Bloodstain across the room, and pulls his arm back for a punch."
    
    sl "Admonishing Knuckle!"
    
    b "Aaaaaiiiiieeee!"
    
    show pjotr happy at right
    
    p "What is happening now on field trip? We are to give kids bonding experience and now question mark man is engaging in mortal combat with student!"
    
    "Peter Pjotr offers Bloodstain a hand. After a moment's hesitation, Bloodstain accepts."
    
    h "You gotta snap out of it, Lesko!"
    
    p "He seems unlikely to stop with the destruction. I do not think asking will help now."
    
    h "Dangit, Lesko! I didn't want to do this! Hallowed Mirror Blade!"
    
    b "This one's from dad! Supreme Slash End!"
    
    p "I will not let theme park mascot harm students! Flaming Vortex Chunker!"
    
    menu:

        "Black Hole Burst!":
            jump lesko_defeated

        "Unlimited Big Brutal Burning Bodacious Break Buster!":
            jump lesko_defeated  
            
label lesko_defeated:

    stop music
    
    sl "AAAAAAAAAAARGH"
    
    show chaos emeralds
    
    pause 2
    
    hide chaos emeralds
    
    pause 2
    
    show lesko normal
    
    play music "metrocross.ogg" fadeout 1
    
    o "You were able to overcome the power of the chaos emeralds? Impossible!"
    
    b "-huff, huff- I think we did it."
    
    p "Not quite. Man is weakened, but is still able to fight."
    
    b "My katana, Battleborn, can exinguish his life in a moment's notice."
    
    h "Now just hold on a dang minute! He's no threat to us now. Just let the man go in peace."
    
    menu:

        "We should let him go.":
            jump hank_good

        "He's too dangerous to be spared.":
            jump hank_bad
            
label hank_bad:

    b "I agree. With that much power, he could've destroyed the entire town."
    
    h "No! Lesko!"
    
    "You restrain Hank, while Bloodstain delivers the finishing blow."
    
    o "That's my cue to split!"
    
    p "Spectacled dwarf man should stay until authorities arrive for questioning."
    
    o "...Alright, I surrender."
    
    jump leskoland_end
    
label hank_good:

    $ hank_flag = True

    b "...Hmph, fine. Battleborn's thirst for blood will remain unquenched, this day."
    
    show bloodstain neutral
    
    p "We will take glowing super villain and elderly man to nearby prison."
    
    h "Thank you, Mario. I knew you had a good head on your shoulders."
    
    l "Hank? Is that you?"
    
    h "It's me, Lesko! It's your old buddy, Hank Hill! I've been looking all over for ya!"
    
label leskoland_end:

    p "Students should return to group until end of field trip."
    
    "You and Bloodstain walk back to meet your classmates."
    
    play music "recet2.ogg" fadeout 1
    
    scene bg leskoland
    
    show bloodstain neutral
    
    b "So, MFGG was behind Lesko Land too."
    
    b "MFGG, the Megalomaniacs For the Greater Good, have been wreaking havoc all across Japan for the past few months. When their leader, Moneybags, stole my family's money hoard, I vowed to take them down at any cost."
    
    "You tell Bloodstain what happened yesterday, at the wrestling ring."
    
    b "The Heartless, huh? So that's their plan..."
    
    b "Mario, these attacks won't stop unless someone takes Moneybags down. I was planning on fighting on my own, but you've proven a valuable ally. Would you join my quest?"
    
    "Bloodstain offers you his hand. You give him a firm handshake, and nod in approval."

    b "Sugoi. Our battle went well today. Let's rest, and discuss our plans tomorrow."
    
    scene bg house
    
    pause 2
    
    scene bg room
    
    play music "recet1.ogg" fadeout 1

    "You return home from the field trip, and go to bed early that night."
    
    scene bg kitchen
    
    if hank_flag:
       jump happy_hank
       
    show hank determined
    
    "The next morning, you wake up early to talk to Hank."
    
    h "Oh, it's you, Mario."
    
    h "I'm not much in the mood for small talk today."
    
    "You tell Hank about MFGG, and about your encounters with Moneybags."
    
    h "MFGG? Those gosh darn bastards will pay for this."
    
    hide hank
    
    "Hank rushes out to his car before you can say another word. You watch from the kitchen window as he drives off into town."
    
    stop music
    
    scene bg tombstone
    
    "Later, you discover that Hank died in battle. Without Hank's help, you're unable to stop Moneybags. So ends your adventure."
    
    pause 2
    
    return
       
label happy_hank:

    show hank friendly
     
    h "Mornin'! That was a pretty dang hairy situation yesterday, buddy! Glad you're on my side."
    
    h "Y'know, I've been looking for Lesko this entire time. We used to fight side by side, but just last year he was all Heartless this and darkness that."
    
    h "I tracked him to this town, but yesterday was the first time I'd seen him in months. I'm still not sure what the heck happened."
    
    "You tell Hank about MFGG, and about your encounters with Moneybags."
    
    show hank determined
    
    h "So they're the ones behind all this. If they keep releasing Heartless, the world could be in a real pickle."
    
    h "I have some idea as to where we can find this Moneybags fellow."
    
    show hank friendly
    
    h "But this time, we'll be workin' together. Right, buddy?"
    
    h "When I find MFGG Headquarters, I'll give you a phone call. 'Till then, you should stay in school."
    
    scene bg house
    
    "You and Hank walk outside together, and wave goodbye as you part ways."
    
    if takagi_flag:
       jump takagi_serious
       
    else:
       jump class_cancelled
       
   
label takagi_serious: 

    play music "happy.ogg" fadeout 1
    t "ay neighbour what's good lol"
    
    show takagi ok
    
    t "you got this stone cold serious look on your face, like robocop. or like robocop 3"
    
    t "lemme see your phone for a sec."
    
    show cellphone at left
    
    "You hand Takagi your phone. She struggles to hold it, but manages to key a number in and hand it back to you."
    
    t "there. i'm numero oneo on your speed dial, gimme a call if you need anything. neighbours gotta stick together."
    
    hide cellphone
    
    "You thank Takagi, and say your goodbyes as you board the bus."
    
    hide takagi
    
label class_cancelled:

    show bg school
    
    pause 2
    
    show bg class
    
    show krabs neutral
    
    play music "spinball.ogg" fadeout 1
    
    k "Hello, students and kids. I've been forced to make an announcement today." 
    
    "Mr. Krabs is reading a crinkled piece of paper as he speaks to the class."
    
    k "Your teacher is busy being interviewed by the police today, so class is cancelled."
    
    k "Oh, I'm also supposed to tell you not to worry. And I shouldn't mention the police."
    
    k "Well, that's everything. Make sure to donate to my Patreon, once I figure out what Patreon is!"
    
    hide krabs
    
    show bloodstain neutral
    
    b "This presents an excellent opportunity for us. Let us meet outside to discuss strategy, over lunch."
    
    stop music
    
label mike_chat:

    scene bg school
    
    "You and Bloodstain go to the dirt path behind the school, and bring out your lunches."
    
    show bloodstain neutral at left
    
    show masquerade mike at right
    
    play music "shittygame.ogg" fadeout 1
 
    m "Hey fucker, you're new around here, right? I'm Masquerade Mike, mind if I join you for lunch?"
     
    "You ask Bloodstain why he brought another friend."

    b "He is not my friend."
     
    m "Alright guys what're we talking about? Just some regular kid stuff eh haha! So, new kid, what're you eating today?"
     
    menu:

        "Spaghetti and meatballs.":
            jump mike_attack

        "A chili dog.":
            jump mike_attack   
     
label mike_attack: 
 
     m "Whoa hey cool we should trade! I brought a sandwich here have a taste ffffffucker!"
     
     "Masquerade Mike shoves a sloppily put together sandwich in your mouth. Reflexively, you swallow a piece, choking a bit as you do."
     
     "You taste rye bread, an excess of mayonnaise, pickles and some sort of fish."
     
     "Fish?"
     
     scene bg black
     
     "Your vision fades to black."
     
     b "Who are you?"
     
     m "It doesn't matter who I am. What matters is my plan."
     
     b "Mario, are you alright? What the hell did you feed him?"
     
     b "Is this trout? He's allegic to pan-seared trout!"
     
     m "Yeah haha I know. I pan-fried it myself this morning!"
     
     "You feel your vision returning to normal."
     
     m "Wait, fuck. Was it supposed to be pan-seared?"
     
     scene bg school
     
     show bloodstain katana at left
    
     show masquerade mike at right
     
     "As your vision returns to normal, you see Bloodstain pointing his katana at Masquerade Mike."
     
     b "Was getting caught part of your plan?"
     
     m "Of course."
     
     m "No one cared who I was until I put on the mask."
     
     b "If I take that off will you die?"
     
     m "It would be extremely painful."
     
     b "You're a big guy."
     
     m "For you."

     play music "forces.ogg" fadeout 1
     
     "You reach for Masquerade Mike's masquerade mask. It slips off easily."
     
     show masquerade heartless at right
     
     b "What the hell?"
     
     m2 "That's right fuckers, it is I, Mike, Seeker of Darkness! MFGG hired me to kill you before you learned too much!"
     
     b "You're with MFGG huh? Then you're going down. Time for my ultimate technique."
     
     "Bloodstain places two fingers on his forehead and begins to concentrate intently. In an instant, he disappears from sight and reappears behind Mike."
     
     show bloodstain katana at right behind masquerade 
     
     m2 "Heh, you think a little trick like that's going to stop me? I'm immortal, you little shit!"
     
     m2 "HYEEEUGH"
     
     "Mike collapses to the floor. His body is shredded in a dozen places, black ether seeping out in every direction."
     
     b "Nothing personal, kid."
     
     show bloodstain neutral at left
     
     "With a flourish, Bloodstain flicks his katana clean and sheathes it. He seems confident in his victory, but you wonder if the battle is truly over."
     
     hide masquerade heartless
     
     "Mike's body melts into a dark puddle, and begins to bubble. You stand back, firearm at the ready, as it forms into a new shape."
     
     show void neutral at right
     
     play music "spyro.ogg" fadeout 1
     
     v "That was weird."
     
     show bloodstain katana
     
     b "Back for round 2, Mike-san?"
     
     hide bloodstain
     
     show bloodstain katana
     
     "Bloodstain moves in to attack the creature."
     
     v "Whoa hey hey hey hold on! Mike is dead! I didn't even like that guy!"
     
     v "S-Seriously, we're completely different people! He only listened to Slayer, I'm more into the Guess Who. I'm just part of the void that he was composed of!" 
     
     b "Void-chan... Sou ka..."
     
     show void confused
     
     v "Hey, why don't you put those weapons away, fellas. I'm not going to attack you or anything! Look, I don't even have arms!"
     
     b "Well Mario, it's your call. Can we trust Void-chan?"
     
     menu:

        "We can trust her.":
            jump void_good

        "She's too dangerous.":
            jump void_bad   
            
label void_bad:

    b "I agree, Mario. There's no way we can let Void-chan go. Imagine the untold havoc she could cause."
    
    show void neutral
    
    v "Well if that's how you feel, I'm getting out of here! I didn't want to hang out at a high school anyway, it all smells like teen spirit."
    
    "Void-chan runs off into the distance. Bloodstain attempts to give chase, but he's quickly reduced to panting on ground, his face bright red."
    
    b "I'm -huff- exhausted from the -huff- intense battle. We'll get her next time."
    
    jump void_end
    
label void_good:

   $ void_flag = True

   show void happy
   
   v "Thanks boys, you won't regret it! Well, it's about time for me to take off. I am nothing, but that doesn't mean I do nothing!"
   
   hide void

label void_end:
    
    "You let Void-chan run off, and go back to eating lunch. While you eat, Bloodstain talks at length about how he plans to track down Moneybags."
    
    "brrrring brrrrrrrrrrrrrring"
    
    show cellphone at left
    
    h "I've found the Megalomaniacs For the Greater Good. Meet me at the wrestling ring when you're ready."
    
    hide cellphone
    
    b "Mario, this is no time for personal phone calls. We'll never take down MFGG if you let your personal life distract you from the mission."
    
    "You tell Bloodstain that Hank's found MFGG headquarters."
    
    b "...I see. Well, time is of the essence. Shall we depart?"
    
    "You and Bloodstain take the next bus into town."
    
    scene bg wrestlers
    
    play music "wrestling.ogg" fadeout 1
    
    show hank determined at left
    
    show bloodstain katana at right
    
    h "Good, you're here. The entrance is inside, but Barry Beefcake and friends kicked me out before I could break in."
    
    "Wrestler" "Yeah, uh, we need to stop anyone who's, uh, snooping around. Boss's orders."
    
    b "Hank-dono, good to see you again. Shall we cut our way through?"
    
    h "Gosh son, no! They're just a group of fine, able-bodied men doing their job. We'll have to find another way in."
    
    show bloodstain neutral
    
    b "Sou ka. I've been trained in movement through the shadows. Allow me to find us an infiltration route."

    "Bloodstain wanders the area, looking for another entrance."

    hide hank

    show void neutral at left

    v "Hey, it's you two!"

    if void_flag:
       jump wrestlers_bypass
       
    else:
       jump wrestlers_lose
       
label wrestlers_lose:

    v "You tried to kill me earlier!"
    
    show bloodstain katana
    
    b "Indeed we did, and this is our chance to finish the job."
    
    v "No way, I'm not dealing with you jerks again! I'm a rising superstar in the professional wrestling scene!"
    
    "Wrestler" "Hey uh, Void-chan. Are these guys givin' you a hard time?"
    
    v "Understatement of the year, Tommy! Porn 'stache and Neo over here are bad news! You should get the guys together and beat the hell out of them!"
    
    show bloodstain neutral
    
    b "If it's a battle you want, so be it. My hand to hand technique rivals that of the greatest martial artists in history."
    
    show bg black
    
    hide void
    
    hide bloodstain
    
    "The never-ending horde of professional wrestlers overwhelm you and your group. Assaulted from all sides, you black out without even knowing what hit you. So ends your adventure."
    
    return
    
label wrestlers_bypass:

    show void happy

    v "My dearest friends! How are you two doing? Still not interested in killing me, right?"
    
    b "Hai, a cursory analysis of your frame and posture clearly identifies you as a non-threat."
    
    v "Sure, whatever you say! More to the point, what are you guys doing here? I figured tall, dark and not so handsome would be more into the anime, not pro wrestling."
    
    b "In fact, we're attempting to gain access to this building to take down the Megalomaniacs For the Greater Good."
    
    v "Well I have no idea what the heck that means, but I can get you in if you want. I'm the new face of Smalltown Wrestling! These guys do pretty much anything I ask."
    
    show void neutral
    
    v "Hey boys! I'm going to show my friends here around the building! They're big fans of mine!"
    
    "Wrestler" "But Mr. Moneybags said we need to, uh, kick everyone out of the wrestling ring. End quote."
    
    v "It'll be fine! I'll be with them the whole time, and when we're done I'll kick them out myself!"
    
    "Wrestler" "Well uh, I cannot argue with the logic of your statements. Go right ahead."
    
    show void happy
    
    v "See? I'm practically royalty in here."
    
    b "While I would've preferred the stealthy approach, a diplomatic solution can sometimes have merit."
    
    if krabs_flag:
       jump entry_success
       
    else:
       jump entry_fail
    
label entry_success:

    show pjotr happy at leftish
    
    show krabs neutral at rightish
    
    p "Students, what surprise it is to see you here! I am just finishing police interview and see new student and leather boy in periphery vision."
    
    k "Stopping at the wrestling ring, eh? I used to throw a mean right hook back in my day! King Crab, they called me!"
    
    p "As teacher, I must inquire what you are doing at wrestling ring in mid-afternoon, when there is no wrestling."
    
    show hank friendly behind pjotr
    
    h "Nice to meet you, sir. I'm Hank, Mario's caretaker."
    
    b "We're attempting to infiltrate this facility to stop Moneybags and destroy the forces of darkness."
    
    v "Hey!"
    
    b "Present company excluded."
    
    p "Very well. For safety of students, crab counselor and myself will escort students to defeat army of darkness."
    
    k "Sure, I'll lead the troops! My schedule's free anyway, I was just going to finish the paperwork for some new student."
    
    "You, Void-chan, Bloodstain, Peter Pjotr, Mr. Krabs and Hank head into the event center. Inside, Hank leads you to the entrance he found earlier."
    jump cave_scene
    
label entry_fail:
    "The group of wrestlers move aside, and your group heads into the event center. Hank takes you to a hidden room deep underground."
    
    scene bg cave
    
    show hank determined at left
    
    show bloodstain neutral at right
    
    show void neutral
    
    play music "etrian.ogg" fadeout 1
    
    h "Well, this is it. Their headquarters must be past this cave."
    
    b "A troublesome obstacle. We have no way of knowing how deep the cave extends, or where we may surface once we enter. Void-chan, would you survey the area for us?"
    
    v "Me? No way! I still need to breathe like the rest of you! And besides, I never took any swimming lessons. If you want to get through this, you'll need some kinda fish, or maybe a crustacean."
    
    b "I understand. If there's no alternative, we'll have to swim through and trust our instincts."
    
    h "I don't like it, but I think the boy is right. We'll all go together, and if you find an air pocket, you'd best come get the rest of us right quick."
    
    hide hank
    
    hide bloodstain
    
    hide void
    
    "You, Hank and Bloodstain enter the cave, in defiance of the clearly labeled warning. To your dismay, the cave proves too deep and dark to be navigated by chance. Your adventure ends before you can return to the surface."
    
    return
    
label cave_scene:
    scene bg cave
    
    show pjotr happy
    
    show krabs neutral at leftish
    
    show bloodstain katana at rightish
    
    show hank friendly at left
    
    show void neutral at right
    
    play music "spinball.ogg" fadeout 1
    
    h "I reckon this is it. My keyblade detects a darn powerful darkness beyond this cave."
    
    v "Yep, I feel it too!"
    
    k "Then what are ye waiting for? Let's head on in and give those sissies what for!"
    
    p "But how can I shoot darkness with automatic weapon when there is water in the way?"
    
    b "We'll need to send someone in to scout the subterranean pool. I'd do so myself, but my clan traditionally uses a specialized aquatic strike force for missions like this."
    
    hide krabs
    
    h "Well this is a right big problem. We'll need to pick the best man for the job. I can hold my breath for about a minute and a half, can anyone do better?"
    
    v "Nope! I have, uh, chronic asthma. And black lung. And a heart condition. Wouldn't last a minute."
    
    p "I have not yet learned swimming. Perhaps I could walk along bottom of pool? I see it in movie once."
    
    "While the group discusses who should enter the pool, the water slowly drains."
    
    show krabs neutral
    
    k "That was a cinch! They had a big lever labelled Pull to Drain Water. Even painted it bright red! If it's always this simple, I should give up on counseling and start breaking into houses."
    
    "The rest of the group stops to analyze the situation."
    
    b "Ahem. Our route is secure. Let's make haste into their headquarters, before anyone sees us."
    
    "The group begins walking through the cave, determined to stop Moneybags as soon as possible. The path is long and deep. The trip feels eerie, as if you're descending into the depths of hell."
    
    scene bg lab
    
    play music "etrian.ogg" fadeout 1
    
    "Finally, you come through an ice beam door into a strange, high tech area. The whole complex is supended over a massive pit, too deep to even see the bottom."

    show bloodstain katana

    b "The security is top-notch. Whatever's in here, Moneybags spared no expense in hiding it."
    
    show pjotr happy at left
    
    p "Door may have been impossible to pass, had Texan man not known ice based witchcraft."
    
    show hank friendly at leftish
    
    h "That was just a Blizzaga spell, nothin' to holler about."
    
    mb "Intruders, identify yourself."

    "You scan the room, looking for the source of the voice. In a protected room several stories up, you see Moneybags speaking into a microphone."
    
    show moneybags neutral at right

    b "It is I, Bloodstain McSwordman, son of Randy Pitchford and heir to the Pitchford clan. Surrender at once and I shall show you mercy."
    
    mb "You're alive? I sent Masquerade Mike to assassinate you hours ago!"
    
    show void happy at rightish
    
    v "Yeah that didn't work out so well! He was kind of a moron, all things considered."
    
    mb "You've brought a creature of darkness with you? Is there anyone else in my inner sanctum I should know about?"
    
    show krabs neutral
    
    k "I came along too! Er, I mean, I'm the leader of this unit, Captain Eugene Krabs! Get down here and I'll show you a taste of me meaty claws!"

    mb "Absolutely not! My plan is already in its final stages. I have no need to waste time on lower class consumers like you!"
    
    mb "Soon, I will summon the most powerful Heartless in the universe. With it at my side, I'll be free to take control of every world government. No army on Earth can stop me!"
    
    mb "Then, once I've deregulated all industries, I'll be free to make as much money as I want! Brilliant, isn't it?"
    
    p "We will stop evil plan, dog in suit! There is no ethical consumption under capitalism!"
    
    mb "It's already too late! While you're stuck down here, I'll be out there, taking over the world!"
    
    "Voice" "Escape sequence activated."
    
    b "Shimatta! He has an escape pod!"
    
    mb "So long, 99 percenters!"
    
    hide moneybags
    
    h "Dangit! If he summons that Heartless, the world'll go to hell in a handbasket!"
    
    p "Man with very large key is right. We must go to business dog at once."
    
    k "Alright, crew! Let's go... wherever he is!"
    
    v "Do any of you genuises know where he went?"
    
    b "I was not given sufficient information to predict his next move."
    
    hide bloodstain
    
    hide hank
    
    hide pjotr
    
    hide void
    
    hide krabs

label call_choice:
    
    "You'll need help to track Moneybags down in time."
    
    menu:
        "Ask Bloodstain for help.":
          jump call_bloodstain
          
        "Ask Mr Krabs for help.":
           jump call_krabs
            
        "Ask Peter Pjotr for help.":
           jump call_pjotr
            
        "Ask Lesko for help.":
           jump call_lesko
            
        "Ask Hank for help.":
           jump call_hank
            
        "Ask Takagi for help.":
           jump call_takagi
            
        "Ask Void-chan for help.":
           jump call_void
            
        "Ask the old man for help.":
           jump call_old
           
        "Give up.":
           jump give_up
            
label call_bloodstain:
    show bloodstain neutral

    b "Mario, I just said I don't know where he is."
    
    "You apologize for wasting everyone's time."
    
    b "This is serious, Mario. If we don't find Moneybags, Japan is doomed."
    
    hide bloodstain
    
    jump call_choice
    
label call_krabs:
    show krabs neutral

    k "Hmm... If I were rich, where would I go?"
    
    show krabs greedy
    
    k "Aha! He must off counting his money! Let's go get that money! ...bags!"
    
    "You don't think Mr. Krabs will be of much help in this situation."
    
    hide krabs
    
    jump call_choice
    
label call_pjotr:
    show pjotr happy
    
    p "I do not know location of affluent hamster. Perhaps he is returning at present moment, to beg forgiveness for his many crimes."
    
    "You tell Peter Pjotr that Moneybags probably isn't going to give up."
    
    p "Maybe, but there is always small chance."
    
    hide pjotr
    
    jump call_choice
    
label call_lesko:
    show hank determined

    h "Lesko might know where Moneybags went. He's in the hospital right now, I'll give 'im a call."
    
    h "..."
    
    h "No answer. Probably still restin' after the right pounding we gave him. We'll need to find another way."
    
    hide hank
    
    jump call_choice
    
label call_hank:
    show hank friendly

    h "Well, I'm not sure where he might've went. He's summoning a big ol' Heartless, so he must've gone somewhere secluded, where he can mind his own business."
    
    h "Someplace like... the bathroom."
    
    h "...But not exactly like that."
    
    "You thank Hank for his advice."
    
    hide hank
    
    jump call_choice
    
label call_takagi:
    show hank friendly

    h "The neighbour girl? You're gonna call her?"
    
    if takagi_flag:
       jump takagi_rescue
       
    "You realize you don't have any way of contacting Takagi."
    
    hide hank
    
    jump call_choice
    
label call_void:
    show void confused

    v "Me? Sorry, I'm oblivious!"
    
    show void neutral
    
    v "And that Mike guy never learned about this part of the plan. He was more of a contract worker than a full-time employee, y'know? Not in the inner circle."
    
    "You thank Void-chan for the information."
    
    hide void
    
    jump call_choice
    
label call_old:
    show hank determined

    h "Right, the old man was workin' with Moneybags. He might know where that gat'dang Heartless is being summoned."
    
    show bloodstain neutral at right
    
    b "Excellent deduction, Mario. We need only interrogate him to find Moneybags. Where can we find that Jii-san?"
    
    show pjotr happy at left
    
    p "I was told by police that bearded elderly criminal is placed under house arrest at the moment."
    
    h "Perfect! Does he live far from here?"
    
    p "They did not see fit to tell me the address of his residence."
    
    b "And we never learned his name, either. We'll have to find another way."
    
    hide hank
    
    hide bloodstain
    
    hide pjotr
    
    jump call_choice
    
label give_up:
    "You were unable to track Moneybags. If only you'd had more allies, perhaps your adventure might've ended differently..."
    
    return
    
label takagi_rescue:
    show cellphone at left
    
    h "Why do you have the neighbour's number? And on speed dial?"
    
    play music "happy.ogg" fadeout 1
    
    "Before you can explain the sitation, Takagi picks up."
    
    t "hey lol i thought u forgot about me. what's the haps dude"
    
    "You tell Takagi that you need to track Moneybags' escape pod to prevent him from summoning an all-powerful Heartless."
    
    t "ok no prob, i'll just hack the satellite mainframe and track his movements from there."
    
    t "im in"
    
    t "lmao good news, i found him. ur not gonna be able to drive there tho."
    
    h "What's the matter? He's left the dang country?"
    
    t "u could say that lmao. his escape pod is headed for the moon."
    
    show bloodstain neutral at right
    
    b "Masaka! Even if we commandeer a spacecraft, there's no way we can reach him in time!"
    
    t "cool your jets amazing athiest i got this. your ride will be there in a sec."
    
    "Takagi hangs up the phone."
    
    show pjotr happy at left behind cellphone
    
    p "Little girl is very resourceful. You are lucky to have kind neighbours. My own neighbour lets dog defecate on lawn and does not clean."
    
    h "Well, with the internet and everything, they say kids are learning way faster than we ever could."
    
    show bg labspaceship
    
    "A massive spacecraft crashes through the ceiling of the facility, shaking the ground with the intensity of a small earthquake."
    
    show takagi ok
    
    t "get in losers! we're going to the moon"
    
    show krabs neutral at left
    
    k "I've always wanted to fly first class off the planet! Come on lads, I get shotgun!"
    
    show hank friendly
    
    h "You built this thing yourself, Takagi? Are you sure it's safe?"
    
    t "don't worry man i got seatbelts and everything. hurry up i left it idling"
    
    h "Well okay, I guess we have no other choice."
    
    "You and the group climb aboard Takagi's spaceship. You're barely given a chance to sit down before she takes off for the moon. The ride is short and uneventful, if a little bumpy."
    
    scene bg moon
    
    play music "space.ogg" fadeout 1
    
    show void neutral at rightish
    
    v "We made it! I thought for sure it would've exploded way before we made it to the moon."
    
    show takagi smug at left
    
    t "wow thanks for the vote of confidence. unfriended and blocked, i don't deal with haters"
    
    show hank determined
    
    h "Come on crew, we're here, we can breathe in space, let's stop Moneybags."
    
    v "Wait a minute, that's a good point. How come we can breathe in space but we couldn't get through the water earlier without Captain Krabs helping us?"
    
    h "The power of the Keyblade is a strange and unpredictable thing. Look, I think I see them in the background."
    
    t "no those are just regular astronauts. they're taking rock samples or something idk."
    
    show moneybags space at right
    
    mb "So, you've followed me even here. I'm beginning to think I should've taken out a restraining order on you."
    
    show bloodstain katana at leftish
    
    b "No restraining order can stop a Pitchford! This is the end, Moneybags. You have nowhere left to run."
    
    t "yeah we're gonna stop your evil plan and stuff. what was his evil plan btw"
    
    h "We can fill you in on the details later. Right now, we need to stop him from summoning the mother of all Heartless."
    
    mb "Oh, but it's far too late for that!"
    
    show danger dragon at center
    
    mb "I tribute Blue Eyes Ultimate Dragon,"
    
    show danger pikachu at center
    
    mb "a Pokemon created by the devil's dark magick,"
    
    show danger medusa at center
    
    mb "a Medusa head,"
    
    show danger serval at low
    
    mb "an incredibly tall serval,"
    
    show danger furry at center
    
    mb "this thing,"
    
    show danger sandler at center
    
    mb "an Adam Sandler movie,"
    
    show danger cat at center
    
    mb "Tom from Tom and Jerry dressed as a cowboy,"
    
    show krabs neutral at left
    
    show danger crab at low
    
    k "Me ex-wife?"
    
    show krabs neutral behind takagi
    
    show danger knife at center
    
    mb "a 3000 degree knife,"
    
    show danger nitro at center
    
    mb "the Nitro box from an inferior Playstation platformer,"
    
    show danger sandal at center
    
    mb "and an ugly sandal,"
    
    show danger uno at center
    
    mb "and play this card to give it plus 4 to all attributes!"
    
    t "dude that's not how the card works. you can't just make stuff up like that and expect us to go with it"
    
    hide danger
    
    mb "It doesn't matter! The ritual is complete!"
    
    hide krabs
    
    hide hank
    
    hide takagi
    
    hide void
    
    hide bloodstain
    
    hide moneybags
    
    show danger heartless:
          xalign 0.5 yalign 1.0
          linear 3.0 xalign 0.5 yalign -0.5
    
    stop music
    
    pause 2
    
    play music "mmsf.ogg" 
    
    u "RRRRRRRRAAAAAAAAAAAAHHH"
    
    "The Heartless marches forward, slashing, punching and shooting in all directions. The group is able to evade its attacks, but none of them have a chance to strike back."
    
    show hank determined at left behind danger
    
    h "Dagnabbit! I've never fought one this powerful before!"
    
    show pjotr happy at right behind danger
    
    p "I have feeling ordinary bullets will be insufficient to slay magical giant monster."
    
    show takagi smug at rightish behind danger
    
    t "are you guys serious? you didn't have any plan to beat this thing?"
    
    show krabs neutral at right behind danger
    
    k "Step aside, I can take him! One uppercut to the chin and this thing'll be pushing up daisies!"
    
    show void neutral at leftish behind danger
    
    v "You can't even reach its chin, I've seen dogs taller than you. Now everybody shut up, I have a plan."
    
    show bloodstain katana at rightish behind danger
    
    b "Void-chan?! You can beat this thing?"
    
    play music "spyro.ogg" fadeout 1
    
    v "No but I can send it back to where it came. All I need is to draw a simple magic circle, and touch him while standing in it."
    
    t "dude he's not exactly gonna give you a high five lol. does anyone have a better plan?"
    
    h "Hold on now, Takagi. This might be our only chance."
    
    v "Obviously if I just stand in its path and start drawing I'm going to get a 3000 degree knife right in the darkness. That's why you guys are going to push him into it."
    
    b "If that's what it takes, so be it."
    
    show moneybags space at right behind danger
    
    mb "Keep up the good work, Heartless! If you kill the lot of them, I'll promote you to Chief Executive Officer of Murder! You'll still be paid the same, but it's a highly sought after position!"
    
    v "You need to distract it while I sneak behind. From there, I'll give the signal and you need to push him back as hard as you can. Got it?"
    
    h "Well sure, but-"
    
    hide void
    
    "Void-chan slinks into the ground, as little more than a black puddle, and disappears behind the giant Heartless."
    
    b "Everyone fan out! We need to prevent our opponent from gaining any ground, or the battle will be lost."
    
    "You and the group split up, dividing the Heartless's attention between the six of you. It can't seem to process multiple targets, and stops advancing, instead attacking each of you in turn."
    
    t "u know i wasn't really told we were going to fight a big monster thing today. i would've, idk, stretched first or something."
    
    p "We need only hold out until little blob girl finishes vandalizing ground."
    
    "From behind the Heartless, a massive pillar of darkness shoots up and disperses amongst the stars."
    
    v "That was the signal, by the way!"
    
    h "Alright, y'all, we'll need to smack the dang thing all at the exact same time to push it back far enough."
    
    b "Of course. Begin synchronized assault!"
    
    "You, Hank, Takagi, Bloodstain, Mr. Krabs and Peter Pjotr all leap into the air, using the moon's low gravity to rise above the giant Heartless."
    
    h "BIII"
    
    t "BIIIIIIIIG"
    
    b "BIIIIIIIIG KIIII"
    
    p "BIIIIIIIIG KIIIIIII"
    
    k "BIIIIIIIIG KIIIIIIIIIIII"
    
    "All" "BIIIIIIIIG KIIIIIIIIIIIICK!!!!!"
    
    "You all deliver a mighty kick to the Heartless' head. Its tall, weak legs are unable to maintain balance and it stumbles backwards."
    
    k "Well, did we get 'im?"
    
    p "Dangerous creature is still here, so we have not yet succeeded in plan."
    
    v "I'm a few inches too short! It's hard to reach forward when you don't have arms!"
    
    h "Dagnabbit, we didn't push it back far enough!"
    
    play music "yugioh.ogg" fadeout 1
    
    "Your adventure is nearly at an end. If you can prevent the monster from reaching Earth, you may change the fate of the entire planet. What is your next move?"
    
    menu:
        "Jump on it.":
           jump good_end
           
        "Do nothing.":
           jump bad_end
    
label bad_end:
    "You were unable to defeat the Heartless, and were slain in battle. Without anyone left to oppose him, Moneybags is free to take over the world, and establish a monopoly on overpriced niche products. So ends your adventure."
    
    return
    
label good_end:
    "You decide to jump on it, because hey, you're Mario."
    
    v "Got it!"
    
    pause 2
    
    hide danger
    
    show void happy
    
    "The instant your feet finish contacting the Heartless, a wave of darkness swirls up from behind and engulfs it. In seconds it disappears from sight. You see Void-chan standing roughly it its place."
    
    v "That was fun! Who are we fighting next? I think I could probably take out the little girl, if you guys held her down."
    
    b "No, Void-chan. Our next target is that demon, possessed by greed."
    
    mb "Oh! You've defeated my Heartless. Well, it was nice of us to get together, it's been so long since we've done this, old friend, but I really must be going!"
    
    h "Heck no! We're taking you in, y'dang creep!"
    
    p "I agree. Dog who seeks to harm students should be put in cage."
    
    k "Right, good initiative, soliders! Bring him in and lets turn him in for the reward money!"
    
    t "i don't think there's any reward. tbh i'm not sure anything we've done today is legal at all."
    
    v "Shut up! Of course there's a reward! Lobster guy, you carry him on-board and we'll give you the biggest share!"
    
    show krabs greedy
    
    k "Move aside! Ol' Captain Krabs can handle one criminal no problem!"
    
    b "Moneybags, you will repay my clan for every yen stolen from their money hoard. Either in currency, or in blood."
    
    mb "Alright, currency! Wait, blood! No, currency!"
    
    "You and the group board Takagi's spacecraft. She waves goodbye to the astronauts and escorts you back to Japan."
    
    scene bg alley
    
    play music "recet2.ogg" fadeout 1
    
    show takagi ok
    
    t "we've arrived at our destination, please exit in an orderly fashion. thx for flying takagi airlines"
    
    show pjotr happy at right
    
    show moneybags neutral at rightish
    
    p "I will escort criminal mastermind to police. Have good night, rest well and keep up with studies."
    
    show krabs greedy at leftish
    
    k "And I'll escort the reward money into me pockets!"
    
    mb "How could this be? I've lost everything: my money, my Heartless, my business! I was doing this all for the greater good! With no regulations, the free market could reach untold levels of prosperity!"
    
    show hank determined at left
    
    h "That's all well and good, but y'brainwashed my friend Lesko and tried to kill us a bunch of times. You're a dang criminal, Moneybags."
    
    hide krabs
    
    hide pjotr 
    
    hide moneybags
    
    show bloodstain neutral at right
    
    b "I was able to convince Moneybags to transfer his remaining money into my account. Battleborn can be very persuasive."
    
    show swimsuit saber at right
    
    b "And I pulled an extra 5-star. The mission was an overwhelming success, and it was all thanks to you, Mario."
    
    hide swimsuit saber
    
    show takagi smug
    
    t "k upvotes are cool and all but i was hoping for something a little more, idk, good, for saving the day"
    
    h "We should do something together, my treat. Buddy, how d'ya want to celebrate our job well done?"
    
label final_choice:
    
    menu:
        "We should do a playground review.":
            jump playground_review
            
        "We should play sports.":
            jump basketball_end
            
        "We should go to the arcade.":
            jump arcade_end
            
label playground_review:
    t "idk it's pretty sketch to go play on a playground in the middle of the night."
    
    h "Yeah, buddy, I'm gonna have to put a veto on that one. I'm not going to celebrate at a children's playground."
    
    "You try to convince them of the joy of a smooth slide, the exhiliration of the swingset, and the passionate fury you feel for meme wheels, but they're unconvinced."
    
    b "Surely you can think of something else, Mario?"
    
    jump final_choice
    
label basketball_end:
    t "lmao let's do it! there's a court near here, i can show off my sick dunks"
    
    h "Sounds like a plan. Y'know, I used to play center for my high school team."
    
    b "Normally I avoid sports, other than martial arts and kendo, but I am willing to make an exception if you are all set on going."
    
    t "then we're doing it! hurry up dudes it's almost past my bedtime"
    
    scene cg basketball
    
    play music "jojo.ogg" fadeout 1
    
    "Charlesuke" "Welcome to the court! Let's have a GREAT game da ze~"
    
    "You enjoy a game of basketball with some local athletes. So ends your adventure, a resounding success."
    
    jump credits
    
label arcade_end:
    b "Excellent choice. The local game center is open late, and can provide us with hours of amusement."
    
    t "i'm more into playstation but arcades are p. cool too."
    
    h "Sure, you can spend a few tokens at the arcade, my treat. Just stay away from those dang violent games, they turn you into a psycho."
    
    scene cg arcade
    
    "You go to the arcade to celebrate with your friends. So ends your adventure, a resounding success."
    
    jump credits
    
label credits:
    show bg black
    
    "This piece of shit was written by Aidan for the Minus World Forums Gimmick Garrison."

    "Thanks to everyone who submitted suggestions. In order of first submission: Mariofan169, Superchao, Black, Draku, Fun with Despair, Elyk, Two_Finger, Brainwyrms, Jetamo and Snufferin Snugglepuss."
    
    stop music
    
    "???" "And what of the money hoard?"
    
    scene cg moneyhoard
    
    show bloodstain katana
    
    play music "forces.ogg"
    
    b "I got it back. All of it. With interest."
     
    "???" "With this much money, we can finally start work on our magnum opus: Battleborn 2. Excellent work, son."
    
    pause 2
    
    "The end."
    
    # This ends the game.

    return
