import pygame


def init() -> None:
    pygame.mixer.init()


def shutdown() -> None:
    pygame.mixer.quit()
