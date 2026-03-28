# Pokémon-style inspired top-down demo
# Controls: WASD or Arrow Keys

import sys
from pathlib import Path

_src = Path(__file__).resolve().parent.parent
if str(_src) not in sys.path:
    sys.path.insert(0, str(_src))

import pygame

from game import game_logic
from game import graphics
from game import map as game_map
from game import sound


def main() -> None:
    pygame.init()
    sound.init()

    screen, clock, font = graphics.init_window()
    player = pygame.Rect(
        4 * game_map.DISPLAY_TILE + 16,
        9 * game_map.DISPLAY_TILE + 16,
        24,
        30,
    )
    walls = game_map.collision_rects()
    running = True
    anim_timer = 0
    walk_frame = 0

    while running:
        clock.tick(60)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        keys = pygame.key.get_pressed()
        dx, dy, moving = game_logic.input_velocity(keys)
        game_logic.move_player(player, dx, dy, walls)
        anim_timer, walk_frame = game_logic.step_walk_animation(moving, anim_timer, walk_frame)

        center_x = player.centerx
        feet_y = player.bottom - 2
        current_tile = game_map.tile_at_pixel(center_x, feet_y)
        in_tall_grass = current_tile == "T"

        screen.fill(graphics.BLACK)
        graphics.draw_map(screen)
        graphics.draw_player(screen, player, walk_frame)
        graphics.draw_ui(screen, font, in_tall_grass)
        pygame.display.flip()

    sound.shutdown()
    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
