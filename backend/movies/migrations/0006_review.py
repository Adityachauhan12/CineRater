from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('movies', '0005_rating_10_scale'),
    ]

    operations = [
        migrations.CreateModel(
            name='Review',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_id', models.IntegerField()),
                ('content_type', models.CharField(choices=[('movie', 'Movie'), ('tvshow', 'TV Show')], max_length=10)),
                ('body', models.TextField()),
                ('embedding', models.JSONField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'reviews',
                'indexes': [
                    models.Index(fields=['content_id', 'content_type'], name='reviews_content_idx'),
                    models.Index(fields=['user'], name='reviews_user_idx'),
                ],
                'unique_together': {('user', 'content_id', 'content_type')},
            },
        ),
    ]
