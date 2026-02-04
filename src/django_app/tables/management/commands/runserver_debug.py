from django.contrib.staticfiles.management.commands.runserver import (
    Command as RunserverCommand,
)
import os


class Command(RunserverCommand):
    help = "Запускает сервер разработки с принудительным включением DEBUG и кастомными логами"

    def handle(self, *args, **options):
        # 1. Можно принудительно выставить переменные окружения
        os.environ["DJANGO_DEBUG_MODE"] = "True"

        if options["verbose_debug"]:
            self.stdout.write(
                self.style.SUCCESS("--- ЗАПУСК В РЕЖИМЕ ВЫСОКОЙ ДЕТАЛИЗАЦИИ ---")
            )

        # 2. Вызываем стандартный обработчик runserver
        super().handle(*args, **options)
